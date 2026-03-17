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
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meta Ripper Dashboard</title>
    <style>
        :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --accent: #38bdf8; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #334155; text-align: center; }
        .card h3 { margin: 0; font-size: 0.9rem; color: #94a3b8; }
        .card p { font-size: 1.8rem; font-weight: bold; margin: 10px 0 0; color: var(--accent); }
        table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #334155; }
        th { background: #334155; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; }
        .status-fresh { color: #4ade80; } .status-cache { color: #fbbf24; }
    </style>
</head>
<body>
    <h1>Meta Ripper <span style="color: var(--accent)">Control Panel</span></h1>
    
    <div class="grid">
        <div class="card"><h3>Total Cached</h3><p id="stat-cached">0</p></div>
        <div class="card"><h3>System Uptime</h3><p id="stat-uptime">0h</p></div>
        <div class="card"><h3>RAM Usage</h3><p id="stat-ram">0MB</p></div>
    </div>

    <h2>Recent Activity</h2>
    <table id="log-table">
        <thead>
            <tr><th>Timestamp</th><th>Action</th><th>URL</th><th>Status</th></tr>
        </thead>
        <tbody><!-- Logs injected here --></tbody>
    </table>

    <script>
        const API_BASE = 'http://localhost:3000/dashboard';
        const HEADERS = { 'x-api-key': 'your-super-secret-key' };

        async function updateDashboard() {
            try {
                // Fetch Stats
                const statsRes = await fetch(`${API_BASE}/stats`, { headers: HEADERS });
                const stats = await statsRes.json();
                document.getElementById('stat-cached').innerText = stats.total_cached_rips;
                document.getElementById('stat-uptime').innerText = (stats.uptime / 3600).toFixed(1) + 'h';
                document.getElementById('stat-ram').innerText = (stats.memory_usage / 1024 / 1024).toFixed(0) + 'MB';

                // Fetch Logs
                const logsRes = await fetch(`${API_BASE}/logs`, { headers: HEADERS });
                const logs = await logsRes.json();
                const tbody = document.querySelector('#log-table tbody');
                tbody.innerHTML = logs.map(log => `
                    <tr>
                        <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
                        <td>${log.action}</td>
                        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${log.url}</td>
                        <td class="status-${log.action.includes('Cache') ? 'cache' : 'fresh'}">${log.level}</td>
                    </tr>
                `).join('');
            } catch (err) { console.error('Dashboard Error:', err); }
        }

        setInterval(updateDashboard, 5000); // Auto-refresh every 5 seconds
        updateDashboard();
    </script>
</body>
</html>

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
