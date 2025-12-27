export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseKey || !supabaseUrl) {
      return res.status(500).json({ 
        error: 'Supabase configuration missing. Please set environment variables in Vercel.' 
      });
    }

    if (supabaseKey.length < 100) {
      console.warn('Warning: Supabase key seems too short. Make sure you are using anon/public key, not service_role key!');
    }

    return res.status(200).json({ 
      key: supabaseKey,
      url: supabaseUrl,
      type: 'anon_public'
    });

  } catch (error) {
    console.error('Error getting Supabase key:', error);
    return res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}
