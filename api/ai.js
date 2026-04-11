import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'Missing API key' });
    }

    // ✅ check database
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (error || !data) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // ✅ simulate response (for now)
    const { prompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'No input provided' });
    }

    // ✅ ALWAYS return something
    return res.status(200).json({
      reply: `✅ Analysis complete for: ${prompt}`
    });

  } catch (err) {
    console.error("API ERROR:", err);

    return res.status(500).json({
      error: 'Server crashed',
      details: err.message
    });
  }
}