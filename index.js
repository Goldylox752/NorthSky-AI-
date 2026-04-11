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
  const idMatch = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
  const videoId = idMatch ? idMatch[1] : null;

  return {
    title: "YouTube Video",
    description: "Video content",
    image: videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null,
    platform: "youtube",
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

    /* PLATFORM */
    if (platform === "youtube") {
      metadata = handleYouTube(url);
      source = "youtube";
    } else {
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      metadata = await metascraper({ html, url });
      source = "website";
    }

    /* FALLBACK */
    metadata.title = metadata.title || "Untitled Page";
    metadata.description = metadata.description || "No description";

    /* SCREENSHOT */
    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    /* AI */
    let analysis = null;

    if (openai) {
      try {
        const ai = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: `Analyze this:
Title: ${metadata.title}
Description: ${metadata.description}

Return JSON with summary and viral_score`
            }
          ]
        });

        analysis = JSON.parse(ai.choices[0].message.content);
      } catch (e) {
        console.log("AI failed");
      }
    }

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
   START
========================= */
app.listen(3000, () => {
  console.log("Running on 3000");
});