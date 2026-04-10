import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    console.log("🚀 API HIT");

    const key = req.headers['x-api-key'];

    if (!key) {
      return res.status(401).json({ error: "No API key" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 🔑 Get user safely
    const { data: user, error: userError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', key)
      .maybeSingle(); // ✅ safer than .single()

    if (userError) {
      console.error("USER ERROR:", userError);
      return res.status(500).json({ error: "User query failed" });
    }

    if (!user) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    // ✅ Insert usage safely
    const { error: usageError } = await supabase
      .from('usage')
      .insert({
        user_id: user.user_id,
        endpoint: '/rip'
      });

    if (usageError) {
      console.error("USAGE ERROR:", usageError);
    }

    return res.status(200).json({
      message: "API working ✅"
    });

  } catch (err) {
    console.error("🔥 CRASH:", err);
    return res.status(500).json({
      error: "Server crashed"
    });
  }
}