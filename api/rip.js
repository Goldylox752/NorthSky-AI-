import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const key = req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({ error: "No API key" });
  }

  // 🔑 Get user
  const { data: user } = await supabase
    .from('api_keys')
    .select('*')
    .eq('api_key', key)
    .single();

  if (!user) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  // 📊 GET TODAY USAGE
  const today = new Date().toISOString().slice(0,10);

  const { count } = await supabase
    .from('usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.user_id)
    .gte('created_at', today);

  const limit = user.plan === "pro" ? 1000 : 50;

  if (count >= limit) {
    return res.status(403).json({
      error: "Limit reached"
    });
  }

  // ✅ TRACK USAGE (THIS IS WHAT YOU WERE MISSING)
  const { error } = await supabase.from('usage').insert({
    user_id: user.user_id,
    endpoint: '/rip'
  });

  if (error) {
    console.error("USAGE INSERT ERROR:", error);
  }

  // 🎯 RESPONSE
  res.status(200).json({
    message: "API working",
  });
}