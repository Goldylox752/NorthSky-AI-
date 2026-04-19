window.NorthSkyOS = {
  track(event, data) {
    fetch("https://your-api.com/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        session: localStorage.getItem("ns_session_id"),
        user: localStorage.getItem("ns_user_id"),
        score: localStorage.getItem("ns_score"),
        url: location.href
      })
    });
  },

  route(score) {
    if (score >= 15) {
      window.location.href = "https://goldylox752.github.io/RoofFlow-AI/";
    }
  }
};



require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();

/* =========================
   SECURITY LAYER
========================= */

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

/* =========================
   SUPABASE
========================= */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* =========================
   SIMPLE IN-MEMORY CACHE (FIX SPEED ISSUE)
========================= */

const keyCache = new Map();

async function validateKey(key) {
  if (!key) return false;

  if (keyCache.has(key)) return keyCache.get(key);

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, active')
    .eq('key', key)
    .single();

  const valid = !!data && data.active === true;

  keyCache.set(key, valid);

  // auto expire cache after 5 min
  setTimeout(() => keyCache.delete(key), 300000);

  return valid;
}

/* =========================
   AUTH MIDDLEWARE
========================= */

async function auth(req, res, next) {
  try {
    const key = req.headers['x-api-key'];

    if (!(await validateKey(key))) {
      return res.status(403).json({
        error: "Invalid API key"
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      error: "Auth system failure"
    });
  }
}

/* =========================
   RATE LIMIT (SMARTER)
========================= */

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => {
    // future upgrade hook for paid tiers
    return 20;
  }
});

/* =========================
   CRM LOGGING (IMPORTANT UPGRADE)
========================= */

async function logEvent(payload) {
  try {
    await supabase.from('ai_logs').insert([payload]);
  } catch (e) {
    console.log("Log fail (non-critical)");
  }
}

/* =========================
   AI ROUTE (REVENUE ENGINE)
========================= */

app.post('/api/ai', aiRateLimiter, auth, async (req, res) => {

  try {

    const {
      message,
      mode = "chat",
      session_id,
      user_id
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    /* normalize mode */
    const safeMode =
      mode === "analyze" ? "analysis" :
      mode === "search" ? "reasoning" :
      "chat";

    const start = Date.now();

    const ai = await axios.post(
      process.env.AI_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are NorthSky AI. Mode: ${safeMode}. Focus on business growth, leads, and conversions.`
          },
          {
            role: "user",
            content: message
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI_API_KEY}`
        }
      }
    );

    const reply = ai.data?.choices?.[0]?.message?.content;

    const latency = Date.now() - start;

    /* =========================
       LOG EVERYTHING (THIS IS YOUR MONEY DATA)
    ========================= */

    const logPayload = {
      message,
      reply,
      mode: safeMode,
      session_id: session_id || null,
      user_id: user_id || null,
      latency,
      created_at: new Date().toISOString()
    };

    logEvent(logPayload);

    return res.json({
      success: true,
      reply,
      provider: "DeepSeek",
      model: "deepseek-chat",
      latency
    });

  } catch (err) {
    console.error(err.message);

    return res.status(500).json({
      error: "AI request failed"
    });
  }
});

/* =========================
   HEALTH CHECK
========================= */

app.get('/', (req, res) => {
  res.json({
    status: "OK",
    system: "NorthSky Revenue OS API"
  });
});

/* =========================
   START SERVER
========================= */

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 NorthSky OS API running");
});