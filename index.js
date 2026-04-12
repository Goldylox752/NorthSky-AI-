/* ================= CORE ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ================= SIMPLE IN-MEMORY CACHE ================= */
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 min

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    time: Date.now()
  });
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    return data;
  } catch {
    return null;
  }
}

/* ================= PARSER ================= */
function parse(html, url) {
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text() ||
    "Untitled";

  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    $("p").first().text().slice(0, 200) ||
    "";

  const image =
    $("meta[property='og:image']").attr("content") || null;

  const site = new URL(url).hostname.replace("www.", "");

  return {
    title,
    description,
    image,
    site,
    favicon: `https://${site}/favicon.ico`
  };
}

/* ================= ENGINE ================= */
async function engine(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return {
      success: false,
      error: "fetch_failed"
    };
  }

  return {
    success: true,
    metadata: parse(html, url)
  };
}

/* ================= MAIN API ================= */
app.get("/api/rip", async (req, res) => {
  try {
    let { url } = req.query;
    if (!url) return res.json({ error: "no_url" });

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    const key = crypto.createHash("md5").update(url).digest("hex");

    const cached = getCache(key);
    if (cached) {
      return res.json({
        success: true,
        cached: true,
        ...cached
      });
    }

    const result = await engine(url);

    setCache(key, result);

    res.json(result);

  } catch (err) {
    res.json({
      success: false,
      error: "server_error"
    });
  }
});

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.send("🚀 NorthSky API Running");
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 SERVER RUNNING ON PORT", PORT);
});