const express = require('express');
const axios = require('axios');
const YTDlpWrap = require('yt-dlp-wrap').default;
const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-video')()
]);

const app = express();
const ytDlpWrap = new YTDlpWrap(); // Ensure yt-dlp is installed on your system
const PORT = process.env.PORT || 3000;
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json() // Structured JSON is best for searching logs later
  ),
  transports: [
    // 1. Save all "rip" events to a dedicated audit file
    new winston.transports.File({ filename: 'audit.log' }),
    // 2. Also log to console with colors for dev monitoring
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;

app.use(express.json());

app.get('/rip', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  try {
    // Check if it's a known video platform for deep extraction
    const isVideoPlatform = /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|instagram\.com/.test(url);

    if (isVideoPlatform) {
      // Use yt-dlp to get direct media links and deep metadata
      const metadata = await ytDlpWrap.getVideoInfo(url);
      return res.json({
        source: 'yt-dlp',
        title: metadata.title,
        description: metadata.description,
        thumbnail: metadata.thumbnail,
        video_url: metadata.url, // Direct CDN link
        duration: metadata.duration_string,
        formats: metadata.formats.map(f => ({ format_id: f.format_id, ext: f.ext, url: f.url }))
      });
    } else {
      // Fallback to Metascraper for standard websites
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const metadata = await metascraper({ html, url });
      return res.json({ source: 'metascraper', ...metadata });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to rip metadata', details: error.message });
  }
});
// Load environment variables (e.g., using dotenv)
const API_KEY = process.env.RIpper_API_KEY || 'your-super-secret-key';

const authenticate = (req, res, next) => {
  const userKey = req.headers['x-api-key'];
  
  if (userKey && userKey === API_KEY) {
    return next(); // Key matches, proceed to the ripper logic
  }
  
  // Unauthorized access
  res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
};

// Apply to your specific route
app.get('/rip', authenticate, async (req, res) => {
  // Your existing rip/cache logic here...
});
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;

const limiter = rateLimit({
  // Use the existing Redis client
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'ripper_limit:',
  }),
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 100, // 100 requests per IP
  standardHeaders: true, // Show rate limit info in headers
  message: { error: 'Too many requests, please try again later.' },
});
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;

// Configure the Rate Limiter
const ripperLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  
  // Store the counters in Redis
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'ripper_limit:', // Key prefix in Redis
  }),
  
  message: {
    error: 'Too many requests.',
    message: 'You have exceeded the 20 requests per 15 minutes limit.'
  }
});

// Apply the limiter specifically to your /rip route
app.get('/rip', authenticate, ripperLimiter, async (req, res) => {
  // ... your existing rip logic
});

// Apply to your rip route
app.use('/rip', limiter);

app.listen(PORT, () => console.log(`Ripper API running on http://localhost:${PORT}`));
