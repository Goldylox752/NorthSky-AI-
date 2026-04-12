/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
]);

/* ================= APP ================= */
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ================= DEBUG (CRASH FIX) ================= */
process.on("uncaughtException", err => {
  console.error("🔥 UNCAUGHT:", err);
});

process.on("unhandledRejection", err => {
  console.error("🔥 REJECTION:", err);
});

/* ================= CACHE ================= */
const cache = new Map();
const CACHE_TIME = 1000 * 60 * 20;

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.t > CACHE_TIME) {
    cache.delete(key);
    return null;
  }

  return item.d;
}

function setCache(key, data) {
  cache.set(key, { d: data, t: Date.now() });
}

/* ================= USER AGENTS ================= */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
  "Mozilla/5.0 (Linux; Android 12)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
];

function getHeaders() {
  return {
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    "Accept-Language": "en-US,en;q=0.9"
  };
}

/* ================= HELPERS ================= */
function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

function safeSend(res, data) {
  if (!res.headersSent) res.json(data);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/* ================= FETCH ================= */
async function fetchDirect(url) {
  try {
    const { data } = await axios.get(url, {
      headers: getHeaders(),
      timeout: 8000
    });
    return data;
  } catch {
    return null;
  }
}

async function fetchProxy(url) {
  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxy, {
      timeout: 8000
    });
    return data;
  } catch {
    return null;
  }
}

/* ================= BROWSER ================= */
async function fetchWithBrowser(url) {
  let browser;

  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 12000
    });

    return await page.content();

  } catch (e) {
    console.log("Browser failed:", e.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/* ================= SMART FETCH ================= */
async function retry(fn, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
  }
  return null;
}

function needsBrowser(html) {
  if (!html) return true;

  const text = html.toLowerCase();

  return (
    html.length < 1500 ||
    text.includes("captcha") ||
    text.includes("enable javascript") ||
    text.includes("access denied")
  );
}

async function smartFetch(url) {
  let html = await retry(() => fetchDirect(url));

  if (!html) {
    html = await retry(() => fetchProxy(url));
  }

  if (needsBrowser(html)) {
    html = await retry(() => fetchWithBrowser(url));
  }

  return html;
}

/* ================= MAIN HANDLER ================= */
async function handleRequest(req, res) {
  let { url } = req.query;

  if (!url) {
    return safeSend(res, { success: false, error: "No URL" });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  const cached = getCache(url);
  if (cached) return safeSend(res, cached);

  const platform = detectPlatform(url);
  let data = null;

  if (platform === "youtube") {
    try {
      const { data: yt } = await axios.get(
        `https://www.youtube.com/oembed?url=${url}&format=json`,
        { timeout: 5000 }
      );

      data = {
        title: yt.title,
        image: yt.thumbnail_url,
        author: yt.author_name
      };
    } catch {}
  }

  if (!data) {
    const html = await smartFetch(url);

    if (!html) {
      return safeSend(res, { success: false, error: "Fetch failed" });
    }

    const m = await metascraper({ html, url });

    data = {
      title: m.title || "No title",
      description: m.description || "",
      image: m.image || null
    };
  }

  const response = {
    success: true,
    platform,
    metadata: data
  };

  setCache(url, response);
  safeSend(res, response);
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  try {
    await withTimeout(handleRequest(req, res), 20000);
  } catch {
    safeSend(res, { success: false, error: "Timeout" });
  }
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});