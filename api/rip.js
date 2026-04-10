import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const key = req.headers['x-api-key'];

    if (!key) {
      return res.status(401).json({ error: 'No API key' });
    }

    // 🔐 Check API key
    const { data: apiKeyData, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', key)
      .single();

    if (error || !apiKeyData) {
      return res.status(403).json({ error: 'Invalid key' });
    }

    const userId = apiKeyData.user_id;

    // 📊 Get usage today
    const { count } = await supabase
      .from('usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date().toISOString().split('T')[0]);

    // 🧠 Plan check (mock for now)
    const userPlan = apiKeyData.plan || "free";

    if (userPlan === "free" && count > 50) {
      return res.status(403).json({
        error: "Limit reached. Upgrade plan."
      });
    }

    // 📥 Track usage
    await supabase.from('usage').insert({
      user_id: userId,
      endpoint: '/rip'
    });

    // ✅ Your actual API logic here
    return res.status(200).json({
      success: true,
      message: "API call successful"
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}