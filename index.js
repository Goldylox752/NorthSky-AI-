app.post("/api/ai", requireAuth, async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "missing_prompt" });
    }

    // ======================
    // 🧠 CACHE KEY
    // ======================
    const key = crypto.createHash("md5").update(prompt).digest("hex");

    const cached = getCache?.(key);
    if (cached) {
      return res.json({ cached: true, ...cached });
    }

    // ======================
    // 🤖 DEEPSEEK CALL
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

    const output = response?.data?.choices?.[0]?.message?.content;

    if (!output) {
      return res.status(500).json({
        error: "ai_failed",
        raw: response?.data || null
      });
    }

    // ======================
    // 📊 SAFE USER USAGE
    // ======================
    const usage = req.user?.usage ?? 0;
    const limit = req.user?.limit ?? 0;

    const result = {
      success: true,
      reply: output,
      usage,
      remaining: limit - usage
    };

    setCache?.(key, result);

    return res.json(result);

  } catch (err) {
    console.error("❌ AI ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      error: "ai_crash",
      details: err?.response?.data || err.message
    });
  }
});
