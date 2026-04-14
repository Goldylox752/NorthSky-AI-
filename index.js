/* ================= AI (DEEPSEEK) ================= */
app.post("/api/ai", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "missing_prompt" });
    }

    // ✅ Cache key (saves money)
    const key = crypto.createHash("md5").update(prompt).digest("hex");

    const cached = getCache(key);
    if (cached) {
      return res.json({ cached: true, ...cached });
    }

    // ✅ Call DeepSeek
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a powerful AI assistant for business, SEO, and lead generation." },
          { role: "user", content: prompt }
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

    const output = response.data.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({
        error: "ai_failed",
        details: response.data
      });
    }

    const result = {
      success: true,
      reply: output,
      usage: req.user.usage,
      remaining: req.user.limit - req.user.usage
    };

    // ✅ Store cache
    setCache(key, result);

    res.json(result);

  } catch (err) {
    console.error("AI ERROR:", err.response?.data || err.message);

    res.status(500).json({
      error: "ai_crash",
      details: err.response?.data || err.message
    });
  }
});
