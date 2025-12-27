import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import sharp from 'sharp';

const MAX_IMAGES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const ALLOWED_DOMAINS = [
  'storage.googleapis.com',
  'ai-sandbox-videofx',
  'labs.google',
  'googleapis.com'
];

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some((domain) => {
      const entry = domain.toLowerCase();
      return hostname === entry || hostname.endsWith(`.${entry}`);
    });
    
    if (!isAllowed) {
      return false;
    }
    
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.')
    ) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];
  
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
}

function getSourceKey(imageUrl) {
  try {
    const urlObj = new URL(imageUrl);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (e) {
    return imageUrl;
  }
}

function hashSourceKey(sourceKey) {
  return crypto.createHash('sha256').update(sourceKey).digest('hex');
}

function isDuplicateUploadError(error) {
  if (!error) return false;
  const status = error.status || error.statusCode;
  if (status === 409) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('already exists') || message.includes('duplicate');
}

export default async function handler(req, res) {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                    req.headers['x-real-ip'] || 
                    req.socket.remoteAddress || 
                    'unknown';
  
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      success: false,
      error: 'Too many requests. Please try again later.' 
    });
  }

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_KEY) {
    console.error('Missing Supabase environment variables');
    return res.status(500).json({ 
      success: false,
      error: 'Server configuration error' 
    });
  }

  try {
    const { images, compressQuality = 85, maxWidth = 1920, maxHeight = 1920 } = req.body;
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ 
        success: false,
        error: 'Images array required' 
      });
    }

    if (images.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'At least one image URL is required' 
      });
    }

    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ 
        success: false,
        error: `Maximum ${MAX_IMAGES} images allowed per request` 
      });
    }

    const quality = Math.min(Math.max(parseInt(compressQuality) || 85, 1), 100);
    const width = Math.min(Math.max(parseInt(maxWidth) || 1920, 1), 4000);
    const height = Math.min(Math.max(parseInt(maxHeight) || 1920, 1), 4000);

    const invalidUrls = images.filter(url => !isValidImageUrl(url));
    if (invalidUrls.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or unauthorized image URLs detected',
        invalidCount: invalidUrls.length
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

    const bucketName = process.env.BUCKET_NAME || 'flow-images';
    const results = [];
    let successCount = 0;
    let failCount = 0;
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;

    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      
      try {
        console.log(`Processing image ${i + 1}/${images.length}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        let response;
        try {
          response = await fetch(imageUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Flow-Image-Uploader/1.0'
            }
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Request timeout');
          }
          throw fetchError;
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          throw new Error('Invalid content type');
        }

        const arrayBuffer = await response.arrayBuffer();
        const originalBuffer = Buffer.from(arrayBuffer);
        const originalSize = originalBuffer.length;
        
        if (originalSize > MAX_FILE_SIZE) {
          throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }
        
        totalOriginalSize += originalSize;
        
        if (totalOriginalSize > MAX_TOTAL_SIZE) {
          throw new Error(`Total size exceeds maximum limit of ${MAX_TOTAL_SIZE / 1024 / 1024}MB`);
        }
        
        const imageMetadata = await sharp(originalBuffer).metadata();
        
        let processedBuffer = await sharp(originalBuffer)
          .resize(width, height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: quality,
            progressive: true,
            mozjpeg: true
          })
          .toBuffer();
        
        const compressedSize = processedBuffer.length;
        totalCompressedSize += compressedSize;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
        
        const sourceKey = getSourceKey(imageUrl);
        const hash = hashSourceKey(sourceKey);
        const fileName = `flow_${hash}.jpg`;
        
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, processedBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          });
        
        if (error && !isDuplicateUploadError(error)) {
          throw error;
        }
        
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
        
        const metadata = {
          id: hash,
          fileName: fileName,
          publicUrl: urlData.publicUrl,
          originalUrl: imageUrl,
          sourceKey: sourceKey,
          dimensions: {
            width: imageMetadata.width,
            height: imageMetadata.height,
            format: imageMetadata.format
          },
          size: {
            original: originalSize,
            compressed: compressedSize,
            saved: originalSize - compressedSize,
            compressionRatio: `${compressionRatio}%`
          },
          timestamp: Date.now(),
          createdAt: new Date().toISOString()
        };
        
        const jsonFileName = `flow_${hash}.json`;
        const jsonBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
        
        const { error: jsonError } = await supabase.storage
          .from(bucketName)
          .upload(jsonFileName, jsonBuffer, {
            contentType: 'application/json',
            upsert: false
          });
        
        if (jsonError) {
          console.warn(`JSON metadata upload failed: ${jsonError.message}`);
        }
        
        successCount++;
        results.push(metadata);
        
        console.log(`✅ Uploaded: ${fileName} (${compressionRatio}% compression)`);
        
      } catch (error) {
        failCount++;
        const safeErrorMessage = error.message.includes('timeout') 
          ? 'Request timeout'
          : error.message.includes('size') 
          ? 'File size error'
          : error.message.includes('content type')
          ? 'Invalid file type'
          : 'Processing failed';
        
        results.push({ 
          success: false, 
          error: safeErrorMessage,
          originalUrl: imageUrl
        });
        
        const safeUrl = imageUrl.substring(0, 50);
        console.error('❌ Failed:', { url: safeUrl, error: error.message });
      }
    }

    const totalCompressionRatio = totalOriginalSize > 0 
      ? ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(2)
      : 0;

    return res.status(200).json({ 
      success: true,
      total: images.length,
      successful: successCount,
      failed: failCount,
      compression: {
        totalOriginalSize: totalOriginalSize,
        totalCompressedSize: totalCompressedSize,
        totalSaved: totalOriginalSize - totalCompressedSize,
        compressionRatio: `${totalCompressionRatio}%`
      },
      results
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}
