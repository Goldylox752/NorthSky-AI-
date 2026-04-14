import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ✅ 1. AUTH
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

    // ✅ 2. INPUT
    const { prompt, meta, scores } = req.body || {};

    if (!prompt && !meta) {
      return res.status(400).json({ error: 'No input provided' });
    }

    // ✅ 3. BUILD MESSAGE (SMART SWITCH)
    let userMessage = prompt;

    if (meta && scores) {
      userMessage = `
Analyze this website:
Title: ${meta.title}
Description: ${meta.description}

Scores:
SEO: ${scores.seo}
UX: ${scores.ux}
Conversion: ${scores.conv}

Give clear actionable improvements.
      `;
    }

    // ✅ 4. CALL DEEPSEEK
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are an expert AI in business, SEO, UX, and conversion optimization."
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        temperature: 0.7
      })
    });

    const aiData = await response.json();

    if (!aiData.choices) {
      return res.status(500).json({
        error: "AI request failed",
        details: aiData
      });
    }

    const output = aiData.choices[0].message.content;

    // ✅ 5. LOG USAGE
    await supabase.from('usage_logs').insert({
      api_key: apiKey,
      input: userMessage,
      output: output
    });

    // ✅ 6. RESPONSE
    return res.status(200).json({
      success: true,
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
