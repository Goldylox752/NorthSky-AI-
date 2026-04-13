/* ================= CORE ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ================= CACHE ================= */
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
    time: Date.now(),
  });
}

/* ================= URL NORMALIZER ================= */
function normalizeURL(input) {
  try {
    if (!input) return null;
    if (!input.startsWith("http")) input = "https://" + input;
    return new URL(input).toString();
  } catch {
    return null;
  }
}

/* ================= FETCH HTML ================= */
async function fetchHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });

    return res.data;
  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return null;
  }
}

/* ================= PARSER ================= */
function parseHTML(html, url) {
  try {
    const $ = cheerio.load(html);

    const title =
      $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      $("title").text().trim() ||
      "Untitled";

    const description =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      $("meta[name='twitter:description']").attr("content") ||
      $("p").first().text().trim().slice(0, 200) ||
      "";

    const image =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      null;

    const site = new URL(url).hostname.replace("www.", "");

    return {
      title,
      description,
      image,
      site,
      favicon: `https://${site}/favicon.ico`,
    };
  } catch (err) {
    console.log("PARSE ERROR:", err.message);
    return null;
  }
}

/* ================= ENGINE ================= */
async function engine(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return {
      success: false,
      error: "fetch_failed",
    };
  }

  const metadata = parseHTML(html, url);

  if (!metadata) {
    return {
      success: false,
      error: "parse_failed",
    };
  }

  return {
    success: true,
    metadata,
  };
}

/* ================= API ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  try {
    const rawUrl = req.query.url;
    const url = normalizeURL(rawUrl);

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "invalid_url",
      });
    }

    const key = crypto.createHash("md5").update(url).digest("hex");

    const cached = getCache(key);
    if (cached) {
      return res.json({
        success: true,
        cached: true,
        ...cached,
      });
    }

    const result = await engine(url);

    if (!result.success) {
      return res.status(500).json(result);
    }

    setCache(key, result);

    return res.json(result);
  } catch (err) {
    console.log("SERVER ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: "server_error",
    });
  }
});

/* ================= HEALTH CHECK ================= */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`🚀 NorthSky API running on port ${PORT}`);
});