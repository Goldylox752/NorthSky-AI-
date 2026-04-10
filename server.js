const express = require('express');
const axios = require('axios');
const YTDlpWrap = require('yt-dlp-wrap').default;
const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-video')()
]);

const winston = require('winston');
const rateLimit = require('express-rate-limit');

const app = express();
const ytDlpWrap = new YTDlpWrap();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================
   LOGGER
========================= */
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
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
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/rip', limiter);

/* =========================
   HEALTH CHECK (IMPORTANT)
========================= */
app.get('/', (req, res) => {
  res.send('🚀 NorthSky AI Engine is running');
});

/* =========================
   RIP ENGINE
========================= */
app.get('/rip', authenticate, async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    const isVideo =
      /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|instagram\.com/.test(url);

    if (isVideo) {
      try {
        const metadata = await ytDlpWrap.getVideoInfo(url);

        return res.json({
          source: 'northsky-ai-yt-dlp',
          title: metadata.title,
          description: metadata.description,
          thumbnail: metadata.thumbnail,
          duration: metadata.duration_string
        });

      } catch (err) {
        return res.status(500).json({
          error: 'Video extraction failed',
          details: err.message
        });
      }
    }

    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'NorthSky AI Engine'
      }
    });

    const metadata = await metascraper({ html, url });

    return res.json({
      source: 'northsky-ai-metascraper',
      ...metadata
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
  console.log(`NorthSky AI running on port ${PORT}`);
});
