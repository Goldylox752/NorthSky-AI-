app.post("/api/ai", requireAuth, async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");

    const prompt = req.body?.prompt;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "missing_prompt"
      });
    }

    // ======================
    // CACHE KEY
    // ======================
    const key = crypto.createHash("md5").update(prompt).digest("hex");

    const cached = getCache?.(key);
    if (cached) {
      return res.json({
        success: true,
        cached: true,
        ...cached
      });
    }

    // ======================
    // DEEPSEEK CALL
    // ======================
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert AI for business, SEO, marketing, and automation."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const output =
      response?.data?.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({
        success: false,
        error: "ai_failed",
        raw: response?.data || null
      });
    }

    // ======================
    // USAGE TRACKING
    // ======================
    const usage = req.user?.usage ?? 0;
    const limit = req.user?.limit ?? 0;

    const result = {
      success: true,
      provider: "deepseek",
      model: "deepseek-chat",
      reply: output,
      usage,
      remaining: limit - usage
    };

    setCache?.(key, result);

    return res.json(result);

  } catch (err) {
    console.error("AI ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: "ai_crash",
      details: err?.response?.data || err.message
    });
  }
});



await supabase
  .from("profiles")
  .update({
    plan: "pro",
    request_limit: 1000
  })
  .eq("id", userId);


const userId = req.headers.authorization?.replace("Bearer ", "");

const { data: user } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", userId)
  .single();

if (!user) {
  return res.status(401).json({ error: "Unauthorized" });
}



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
