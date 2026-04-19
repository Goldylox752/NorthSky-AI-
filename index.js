require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const app = express();

/* ================= SECURITY ================= */
app.use(helmet());
app.use(express.json({ limit: "15kb" }));

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ================= FAST API KEY CACHE ================= */
const keyCache = new Map();

async function validateKey(key) {
  if (!key) return false;
  if (keyCache.has(key)) return keyCache.get(key);

  const { data } = await supabase
    .from("api_keys")
    .select("active")
    .eq("key", key)
    .single();

  const valid = !!data?.active;

  keyCache.set(key, valid);
  setTimeout(() => keyCache.delete(key), 300000);

  return valid;
}

/* ================= AUTH ================= */
async function auth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!(await validateKey(key))) {
    return res.status(403).json({ error: "Invalid API key" });
  }
  next();
}

/* ================= RATE LIMIT ================= */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25
});

/* ================= EVENT PIPELINE (🔥 CORE VALUE) ================= */
app.post("/api/event", async (req, res) => {
  const event = req.body;

  try {
    await supabase.from("events").insert([{
      ...event,
      created_at: new Date().toISOString()
    }]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "log_failed" });
  }
});

/* ================= AI ENGINE ================= */
app.post("/api/ai", limiter, auth, async (req, res) => {

  try {
    const { message, mode = "chat" } = req.body;

    const response = await axios.post(
      process.env.AI_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are NorthSky Revenue OS AI. Optimize for leads, sales, conversions."
          },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI_API_KEY}`
        }
      }
    );

    res.json({
      success: true,
      reply: response.data?.choices?.[0]?.message?.content
    });

  } catch (e) {
    res.status(500).json({ error: "ai_failed" });
  }
});

/* ================= HEALTH ================= */
app.get("/", (_, res) => {
  res.json({ status: "ok", system: "NorthSky OS" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 NorthSky Revenue OS running");
});