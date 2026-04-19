require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const { body, validationResult } = require("express-validator");

// ================= CONFIGURATION & VALIDATION =================
const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "AI_API_URL",
  "AI_API_KEY",
  "PORT"
];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length) {
  console.error("❌ Missing required environment variables:", missing.join(", "));
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const AI_REQUEST_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS) || 15000;

// ================= INIT APP =================
const app = express();

// Security & parsing
app.use(helmet());
app.use(express.json({ limit: "15kb" }));

// ================= SUPABASE CLIENT =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ================= API KEY CACHE =================
const keyCache = new Map();
async function validateKey(key) {
  if (!key) return false;
  if (keyCache.has(key)) return keyCache.get(key);

  try {
    const { data } = await supabase
      .from("api_keys")
      .select("active")
      .eq("key", key)
      .single();

    const valid = !!data?.active;
    keyCache.set(key, valid);
    setTimeout(() => keyCache.delete(key), 300000); // 5 min TTL
    return valid;
  } catch (err) {
    console.error("Key validation error:", err.message);
    return false;
  }
}

// ================= AUTH MIDDLEWARE =================
async function auth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!(await validateKey(key))) {
    return res.status(403).json({ error: "Invalid or missing API key" });
  }
  next();
}

// ================= RATE LIMITING (per IP) =================
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." }
});

// ================= LOGGING HELPER =================
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(entry));
}

// ================= EVENT PIPELINE =================
app.post("/api/event", globalLimiter, async (req, res) => {
  try {
    const event = req.body;
    if (!event || typeof event !== "object") {
      return res.status(400).json({ error: "Invalid event payload" });
    }

    const { error } = await supabase.from("events").insert([{
      ...event,
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    log("info", "Event stored", { eventType: event.type || "unknown" });
    res.json({ ok: true });
  } catch (err) {
    log("error", "Event storage failed", { error: err.message });
    res.status(500).json({ error: "log_failed" });
  }
});

// ================= AI ENGINE (with validation & timeout) =================
app.post(
  "/api/ai",
  globalLimiter,
  auth,
  [
    body("message").isString().trim().isLength({ min: 1, max: 4000 }),
    body("mode").optional().isIn(["chat", "lead", "analytics"])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
      const { message, mode = "chat" } = req.body;

      const response = await axios.post(
        process.env.AI_API_URL,
        {
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: "You are NorthSky Revenue OS AI. Optimize for leads, sales, conversions."
            },
            { role: "user", content: message }
          ]
        },
        {
          headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
          timeout: AI_REQUEST_TIMEOUT
        }
      );

      const reply = response.data?.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty AI response");

      log("info", "AI request successful", { mode, messageLength: message.length });
      res.json({ success: true, reply });
    } catch (err) {
      log("error", "AI request failed", { error: err.message });
      const status = err.code === "ECONNABORTED" ? 504 : 500;
      res.status(status).json({ error: "ai_failed", details: err.message });
    }
  }
);

// ================= HEALTH CHECK =================
app.get("/", (_, res) => {
  res.json({ status: "ok", system: "NorthSky Revenue OS", timestamp: new Date().toISOString() });
});

// ================= GRACEFUL SHUTDOWN =================
const server = app.listen(PORT, () => {
  log("info", `🚀 NorthSky Revenue OS running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received, closing server...");
  server.close(() => {
    log("info", "Server closed");
    process.exit(0);
  });
});