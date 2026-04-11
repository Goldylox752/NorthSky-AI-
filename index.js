/* =========================
   TRENDING (YOUTUBE RSS)
========================= */
app.get('/trending', async (req, res) => {
  try {
    const rssUrl = "https://www.youtube.com/feeds/videos.xml?chart=mostPopular";

    const { data } = await axios.get(rssUrl);

    const videos = [...data.matchAll(/<entry>(.*?)<\/entry>/gs)].slice(0, 5);

    const results = [];

    for (let v of videos) {
      const chunk = v[1];

      const title = chunk.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const link = chunk.match(/<link rel="alternate" href="(.*?)"/)?.[1];

      if (!link) continue;

      // reuse your own system
      const fakeReq = { query: { url: link } };

      // OPTIONAL: quick metadata instead of full scrape
      results.push({
        title,
        url: link
      });
    }

    return res.json({
      success: true,
      results
    });

  } catch (e) {
    return res.status(500).json({
      error: "Trending fetch failed"
    });
  }
});




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

/* =========================
   OPENAI
========================= */
let openai = null;

try {
  const OpenAI = require("openai");
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch {
  console.log("No OpenAI");
}

/* =========================
   HELPERS
========================= */
function detectPlatform(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "website";
}

function handleYouTube(url) {
  const idMatch = url.match(/(?:v=|youtu\.be\/)([^?&]+)/);
  const videoId = idMatch ? idMatch[1] : null;

  if (!videoId) {
    return {
      title: "YouTube Video",
      description: "Invalid YouTube URL",
      image: null,
      thumbnail: null,
      embed: null,
      platform: "youtube",
      url
    };
  }

  return {
    title: `YouTube Video (${videoId})`,
    description: "Video content optimized for engagement",
    image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    embed: `https://www.youtube.com/embed/${videoId}`,
    platform: "youtube",
    videoId,
    url
  };
}

/* =========================
   ROUTE
========================= */
app.get('/rip', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    let metadata = {};
    let platform = detectPlatform(url);
    let source = '';

    /* PLATFORM HANDLING */
    if (platform === "youtube") {
      metadata = handleYouTube(url);
      source = "youtube";
    } else {
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });

      metadata = await metascraper({ html, url });
      source = "website";
    }

    /* FALLBACK */
    metadata.title = metadata.title || "Untitled Page";
    metadata.description = metadata.description || "No description";

    /* SCREENSHOT */
    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    /* =========================
       AI INTELLIGENCE
    ========================= */
    let analysis = null;

    if (openai && (metadata.title || metadata.description)) {
      try {
        const ai = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are a marketing intelligence engine. Only return valid JSON."
            },
            {
              role: "user",
              content: `
Analyze this content:

Title: ${metadata.title}
Description: ${metadata.description}
Platform: ${platform}

Return JSON:
{
  "summary": "...",
  "hook": "...",
  "target_audience": "...",
  "monetization_angle": "...",
  "viral_score": 1-10
}
              `
            }
          ]
        });

        const raw = ai.choices?.[0]?.message?.content;

        try {
          analysis = raw ? JSON.parse(raw) : null;
        } catch {
          analysis = { raw };
        }

      } catch (e) {
        console.log("AI ERROR:", e.message);
      }
    }

    /* RESPONSE */
    return res.json({
      success: true,
      source,
      platform,
      metadata,
      screenshot,
      analysis
    });

  } catch (err) {
    console.error(err.message);

    return res.status(500).json({
      error: 'Server error',
      details: err.message
    });
  }
});

/* =========================
   START SERVER (RENDER SAFE)
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});