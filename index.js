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
   RIP ROUTE (ONLY ONE)
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
      const video = await ytDlpWrap.getVideoInfo(url);

      return res.json({
        source: 'yt-dlp',
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail,
        duration: video.duration_string
      });
    }

    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });

    const metadata = await metascraper({ html, url });

    return res.json({
      source: 'metascraper',
      ...metadata
    });

  } catch (err) {
    logger.error(err.message);

    return res.status(500).json({
      error: 'Failed to fetch data',
      details: err.message
    });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});