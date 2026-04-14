const express = require("express");
const app = express();

const axios = require("axios");
const crypto = require("crypto");

app.use(express.json());

// ======================
// TEST ROUTE
// ======================
app.get("/", (req, res) => {
  res.json({ status: "NorthSky API running" });
});

// ======================
// AI ROUTE
// ======================
app.post("/api/ai", async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    if (!prompt) {
      return res.status(400).json({ error: "missing_prompt" });
    }

    return res.json({
      success: true,
      reply: "Server is working",
      prompt
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ======================
// START SERVER (RENDER NEEDS THIS)
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
