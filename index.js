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
const CACHE_TTL = 1000 * 60 * 30;

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
  cache.set(key, { data, time: Date.now() });
}

/* ================= HELPERS ================= */
function normalizeURL(input) {
  try {
    if (!input) return null;
    if (!input.startsWith("http")) input = "https://" + input;
    return new URL(input).toString();
  } catch {
    return null;
  }
}

function isURL(str) {
  try {
    new URL(str.startsWith("http") ? str : "https://" + str);
    return true;
  } catch {
    return false;
  }
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
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
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    "Untitled";

  const description =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("p").first().text().trim().slice(0, 200) ||
    "";

  const image =
    $("meta[property='og:image']").attr("content") ||
    null;

  const site = new URL(url).hostname.replace("www.", "");

  return { title, description, image, site };
}

/* ================= CORE ENGINE ================= */
async function scrape(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return { success: false, error: "fetch_failed" };
  }

  const metadata = parseHTML(html, url);

  return {
    success: true,
    metadata,
  };
}

/* ================= MOCK SEARCH ENGINE ================= */
async function searchEngine(query) {
  // Placeholder “multi-site search”
  // Later you can replace with SerpAPI / Bing API

  const fakeResults = [
    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  ];

  const results = [];

  for (const url of fakeResults) {
    const data = await scrape(url);
    if (data.success) {
      results.push({
        url,
        ...data.metadata
      });
    }
  }

  return { success: true, query, results };
}

/* ================= ASK NORTHSKY (ROUTER) ================= */
async function askEngine(input) {
  if (isURL(input)) {
    const url = normalizeURL(input);
    return await scrape(url);
  }

  const search = await searchEngine(input);

  return {
    success: true,
    type: "search",
    answer: `Here are results for "${input}"`,
    ...search
  };
}

/* ================= ROUTES ================= */

/* 🔥 1. SINGLE SCRAPE (your original) */
app.get("/api/rip", async (req, res) => {
  const url = normalizeURL(req.query.url);
  if (!url) return res.status(400).json({ success: false, error: "invalid_url" });

  const key = crypto.createHash("md5").update(url).digest("hex");

  const cached = getCache(key);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  const result = await scrape(url);

  if (!result.success) {
    return res.status(500).json(result);
  }

  setCache(key, result);

  res.json(result);
});

/* 🔍 2. MULTI SEARCH ENGINE */
app.get("/api/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ success: false, error: "no_query" });

  const key = crypto.createHash("md5").update(q).digest("hex");

  const cached = getCache(key);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  const result = await searchEngine(q);

  setCache(key, result);

  res.json(result);
});

/* 🧠 3. ASK NORTHSKY (MAIN AI ENTRY) */
app.get("/api/ask", async (req, res) => {
  const input = req.query.q;

  if (!input) {
    return res.status(400).json({ success: false, error: "no_input" });
  }

  const result = await askEngine(input);
  res.json(result);
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    cacheSize: cache.size
  });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 NorthSky v2 running on port ${PORT}`);
});