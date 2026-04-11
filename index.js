const express = require('express');
const axios = require('axios');
const cors = require('cors');

const metascraper = require('metascraper')([
  require('metascraper-title')(),
  require('metascraper-description')(),
  require('metascraper-image')()
]);

const app = express();
app.use(cors());

/* ================= PLATFORM ================= */
function detectPlatform(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "website";
}

/* ================= TRENDING ================= */
app.get('/trending', async (req, res) => {
  try {
    const { data } = await axios.get("https://www.youtube.com/feeds/videos.xml?chart=mostPopular");

    const videos = [...data.matchAll(/<entry>(.*?)<\/entry>/gs)].slice(0, 6);

    const results = videos.map(v => {
      const chunk = v[1];
      return {
        title: chunk.match(/<title>(.*?)<\/title>/)?.[1] || "Video",
        url: chunk.match(/href="(.*?)"/)?.[1]
      };
    });

    res.json({ success: true, results });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= MAIN ================= */
app.get('/rip', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false });
  }

  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const metadata = await metascraper({ html, url });

    res.json({
      success: true,
      metadata,
      analysis: {
        summary: "Content summary",
        hook: "Strong hook",
        target_audience: "General audience",
        monetization_angle: "Ads / product",
        viral_score: Math.floor(Math.random() * 10) + 1
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Scrape failed"
    });
  }
});

/* ================= START ================= */
app.listen(3000, () => {
  console.log("🚀 Server running");
});