/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const PQueue = require("p-queue").default; // ✅ FIXED

const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
]);

/* ================= INIT ================= */
const app = express();
app.use(cors());
app.set("trust proxy", true);

/* ================= ERROR LOGGING ================= */
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* ================= CACHE ================= */
const cache = {};
const CACHE_TIME = 1000 * 60 * 30;

/* ================= RATE LIMIT ================= */
const usage = {};

function checkUsage(req, res, next) {
  const ip = req.ip;
  usage[ip] = (usage[ip] || 0) + 1;

  if (usage[ip] > 50) {
    return res.status(403).json({
      success: false,
      error: "Upgrade required",
    });
  }

  next();
}

app.use("/api/", checkUsage);

/* ================= QUEUE ================= */
const queue = new PQueue({
  concurrency: 2,
});

/* ================= BROWSER ================= */
let browser;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    console.log("🚀 Chromium launched");
  }
  return browser;
}

/* ================= FETCH METHODS ================= */
async function fetchWithBrowser(url) {
  let page;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setUserAgent("Mozilla/5.0");

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    const html = await page.content();
    console.log("🟢 Puppeteer success");

    return html;
  } catch (e) {
    console.log("🔴 Puppeteer failed:", e.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

async function fetchHTML(url) {
  // 1️⃣ Normal request
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000,
    });

    console.log("✅ Normal worked");
    return data;
  } catch {
    console.log("❌ Normal failed");
  }

  // 2️⃣ Proxy fallback
  try {
    const proxyURL = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxyURL, {
      timeout: 12000,
    });

    console.log("🟡 Proxy worked");
    return data;
  } catch {
    console.log("❌ Proxy failed");
  }

  // 3️⃣ Puppeteer fallback (queued)
  return queue.add(() => fetchWithBrowser(url));
}

/* ================= SAFE FETCH ================= */
async function safeFetch(url) {
  try {
    return await Promise.race([
      fetchHTML(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 25000)
      ),
    ]);
  } catch (err) {
    console.error("safeFetch error:", err.message);
    throw err;
  }
}

/* ================= ROUTES ================= */
app.get("/api/rip", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "URL required",
    });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  console.log("🔍", url);

  // Cache check
  const cached = cache[url];
  if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
    console.log("⚡ Cache hit");
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const html = await safeFetch(url);

    let metadata = {
      title: "Unknown Page",
      description: "No description",
      image: null,
    };

    let scraped = false;

    if (html) {
      try {
        const data = await metascraper({ html, url });

        metadata = {
          title: data.title || metadata.title,
          description: data.description || metadata.description,
          image: data.image || null,
        };

        scraped = true;
        console.log("✅ Scraped");
      } catch {
        console.log("⚠️ metascraper failed");
      }
    }

    const screenshot = `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    const responseData = {
      success: true,
      scraped,
      metadata,
      screenshot,
    };

    cache[url] = {
      data: responseData,
      timestamp: Date.now(),
    };

    return res.json(responseData);
  } catch (err) {
    console.log("❌ ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: "Server failure",
    });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});

module.exports = app;