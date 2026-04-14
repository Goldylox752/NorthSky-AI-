require('dotenv').config(); // Load .env for local dev (ignored on production platforms)

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('crypto'); // kept for potential future use

const app = express();

// ======================
// REQUIRED ENV VARS CHECK (fail fast)
// ======================
const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'AI_API_KEY',       // API key for DeepSeek/OpenAI
  'AI_API_URL'        // e.g., https://api.deepseek.com/v1/chat/completions
];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

// ======================
// SECURITY MIDDLEWARE
// ======================
app.use(helmet()); // Sets various HTTP headers for security

// Rate limiter: 20 requests per minute per IP (adjust as needed)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '10kb' })); // Limit body size to prevent large payloads

// ======================
// SUPABASE CLIENT (for API key validation)
// ======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ======================
// HELPER: VALIDATE API KEY
// ======================
async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  // Efficient check: only count active keys, no data retrieval
  const { count, error } = await supabase
    .from('api_keys')
    .select('key', { count: 'exact', head: true })
    .eq('key', apiKey)
    .eq('active', true); // optional: only allow active keys
  if (error) {
    console.error('Supabase validation error:', error.message);
    return false;
  }
  return count > 0;
}

// ======================
// MIDDLEWARE: API KEY AUTH
// ======================
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key. Provide x-api-key header.' });
  }
  const valid = await isValidApiKey(apiKey);
  if (!valid) {
    return res.status(403).json({ error: 'Invalid or inactive API key.' });
  }
  next();
}

// ======================
// TEST ROUTE (public, no auth)
// ======================
app.get('/', (req, res) => {
  res.json({ status: 'NorthSky API running', version: '2.0' });
});

// ======================
// AI ROUTE (protected + rate limited)
// ======================
app.post('/api/ai', aiRateLimiter, authenticateApiKey, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt.' });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ error: 'Prompt too long (max 4000 chars).' });
    }

    // Call external AI service (DeepSeek / OpenAI compatible)
    const aiResponse = await axios.post(
      process.env.AI_API_URL,
      {
        model: 'deepseek-chat', // or your specific model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds
      }
    );

    const reply = aiResponse.data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error('Unexpected AI response structure');
    }

    return res.json({
      success: true,
      reply: reply,
      prompt: prompt,
    });
  } catch (err) {
    console.error('AI endpoint error:', err.message);
    // Don't leak internal error details to client
    if (err.response) {
      // Log status but send generic error
      console.error('AI service responded with status:', err.response.status);
    }
    return res.status(500).json({ error: 'AI service unavailable or request failed.' });
  }
});

// ======================
// HEALTH CHECK (for load balancers)
// ======================
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Secure NorthSky server running on port ${PORT}`);
});

// ======================
// GRACEFUL SHUTDOWN
// ======================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});