import { createClient } from '@supabase/supabase-js';

const LIST_PAGE_SIZE = 500;
const INSERT_CHUNK_SIZE = 100;

function getBearerToken(req) {
  const raw = req.headers.authorization || '';
  const [type, token] = raw.split(' ');
  if (type !== 'Bearer') return '';
  return token || '';
}

function authorizeRequest(req) {
  const headerToken = req.headers['x-sync-token'];
  const bearerToken = getBearerToken(req);
  const queryToken = req.query?.token;
  const token = headerToken || bearerToken || queryToken;
  return Boolean(token && token === process.env.SYNC_SECRET);
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase service role config');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'flow-sync' } }
  });
}

async function listAllObjects(supabase, bucket, folder, maxObjects) {
  const objects = [];
  let offset = 0;

  while (objects.length < maxObjects) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      objects.push({ ...item, fullPath });
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }

    offset += LIST_PAGE_SIZE;
  }

  return objects.slice(0, maxObjects);
}

function isSyncCandidate(item) {
  if (!item || !item.name) return false;
  if (item.name.endsWith('/')) return false;
  return item.name.toLowerCase().endsWith('.jpg');
}

async function loadExistingPaths(supabase, table, paths) {
  if (paths.length === 0) return new Set();
  const { data, error } = await supabase
    .from(table)
    .select('storage_path')
    .in('storage_path', paths);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((row) => row.storage_path));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authorizeRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dryRun = req.query?.dryRun === '1';
  const bucket = process.env.BUCKET_NAME || 'flow-images';
  const table = process.env.SYNC_TABLE || 'flow_images';
  const folder = process.env.SYNC_FOLDER || '';
  const maxObjects = Math.max(parseInt(process.env.SYNC_MAX_OBJECTS, 10) || 2000, 1);

  try {
    const supabase = getSupabaseClient();
    const objects = await listAllObjects(supabase, bucket, folder, maxObjects);
    const candidates = objects.filter(isSyncCandidate);
    const paths = candidates.map((item) => item.fullPath);
    const existingPaths = await loadExistingPaths(supabase, table, paths);

    const rowsToInsert = candidates
      .filter((item) => !existingPaths.has(item.fullPath))
      .map((item) => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(item.fullPath);
        return {
          storage_path: item.fullPath,
          public_url: data.publicUrl,
          metadata: item.metadata || null
        };
      });

    if (!dryRun && rowsToInsert.length > 0) {
      const chunks = chunkArray(rowsToInsert, INSERT_CHUNK_SIZE);
      for (const chunk of chunks) {
        const { error } = await supabase.from(table).insert(chunk);
        if (error) {
          throw error;
        }
      }
    }

    return res.status(200).json({
      success: true,
      bucket,
      table,
      folder,
      dryRun,
      scanned: objects.length,
      candidates: candidates.length,
      inserted: dryRun ? 0 : rowsToInsert.length
    });
  } catch (error) {
    console.error('Sync failed:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}
