import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    // ✅ 1. Check API key
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'Missing API key' });
    }

    const { data: user, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (error || !user) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // ✅ 2. Validate input
    const { prompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'No input provided' });
    }

    // ✅ 3. Call DeepSeek
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a powerful AI assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const aiData = await response.json();

    // ⚠️ Handle API errors safely
    if (!aiData.choices) {
      return res.status(500).json({
        error: "AI request failed",
        details: aiData
      });
    }

    const output = aiData.choices[0].message.content;

    // ✅ 4. (Optional but IMPORTANT) Track usage
    await supabase.from('usage_logs').insert({
      api_key: apiKey,
      prompt: prompt,
      response: output
    });

    // ✅ 5. Return response
    return res.status(200).json({
      reply: output
    });

  } catch (err) {
    console.error("API ERROR:", err);

    return res.status(500).json({
      error: 'Server crashed',
      details: err.message
    });
  }
}
