const express = require('express');
const axios = require('axios');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;

const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-video')()
]);

const rateLimit = require('express-rate-limit');
const winston = require('winston');

/* =========================
   SAFE OPENAI LOAD
========================= */
let openai = null;

try {
  const OpenAI = require("openai");
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch (err) {
  console.log("OpenAI not installed — skipping AI");
}

const app = express();
const ytDlpWrap = new YTDlpWrap();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

/* =========================
   LOGGER
========================= */
const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()]
});

/* =========================
   AUTH
========================= */
const API_KEY = process.env.NORTHSKY_AI_API_KEY || 'your-super-secret-key';

const authenticate = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/* =========================
   RATE LIMIT
========================= */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

app.use('/rip', limiter);

/* =========================
   HEALTH CHECK
========================= */
app.get('/', (req, res) => {
  res.send('🚀 NorthSky AI Engine is running');
});

/* =========================
   RIP + AI ENGINE
========================= */
app.get('/rip', authenticate, async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    let metadata = {};
    let source = '';

    const isVideo =
      /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|instagram\.com/.test(url);

    /* ---------- VIDEO ---------- */
    if (isVideo) {
      const video = await ytDlpWrap.getVideoInfo(url);

      metadata = {
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail
      };

      source = 'yt-dlp';
    } 
    /* ---------- WEBSITE ---------- */
    else {
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });

      metadata = await metascraper({ html, url });
      source = 'metascraper';
    }

    /* =========================
       AI ANALYSIS (SAFE)
    ========================= */
    let analysis = null;

    try {
      if (openai && metadata.description) {
        const ai = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "user",
              content: `
Analyze this website:

Title: ${metadata.title}
Description: ${metadata.description}

Give a short business + marketing insight summary.
              `
            }
          ]
        });

        analysis = ai.choices?.[0]?.message?.content || null;
      }
    } catch (aiErr) {
      logger.warn("AI failed: " + aiErr.message);
    }

    /* =========================
       RESPONSE
    ========================= */
    return res.json({
      source,
      ...metadata,
      analysis // 🔥 frontend uses this
    });

  } catch (err) {
    logger.error(err.message);

    return res.status(500).json({
      error: 'NorthSky AI failed',
      details: err.message
    });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 NorthSky AI running on port ${PORT}`);
});