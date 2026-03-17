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

app.listen(PORT, () => console.log(`Ripper API running on http://localhost:${PORT}`));
