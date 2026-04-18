require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// ================= RATE LIMIT =================
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ================= API CHECK =================
async function validateKey(key) {
  if (!key) return false;

  const { count } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .eq('active', true);

  return count > 0;
}

async function auth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!(await validateKey(key))) {
    return res.status(403).json({ error: "Invalid API key" });
  }
  next();
}

// ================= AI ROUTE =================
app.post('/api/ai', aiRateLimiter, auth, async (req, res) => {
  try {
    const { message, mode } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // normalize mode (THIS FIXES YOUR ERROR)
    const safeMode =
      mode === "analyze" ? "analysis" :
      mode === "search" ? "reasoning" :
      "chat";

    const ai = await axios.post(
      process.env.AI_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `Mode: ${safeMode}`
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

    return res.json({
      success: true,
      reply,
      provider: "DeepSeek",
      model: "deepseek-chat"
    });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      error: "AI request failed"
    });
  }
});

// ================= HEALTH =================
app.get('/', (req, res) => {
  res.json({ status: "OK" });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});