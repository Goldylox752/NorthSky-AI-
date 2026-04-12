/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const LRU = require("lru-cache");

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CACHE (ENTERPRISE) ================= */
const cache = new LRU({
  max: 500,
  ttl: 1000 * 60 * 60 // 1 hour
});

/* ================= TIMEOUT WRAPPER ================= */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);
}

/* ================= SAFE RESPONSE ================= */
function safeSend(res, data) {
  if (!res.headersSent) res.json(data);
}

/* ================= FETCH ENGINE ================= */
async function fetchHTML(url, timeout = 6000) {
  try {
    const { data } = await axios.get(url, {
      timeout,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html"
      }
    });

    return data;
  } catch {
    return null;
  }
}

/* ================= SMART META PICKER ================= */
function pick($, selectors) {
  for (const sel of selectors) {
    const val = $(sel).attr("content") || $(sel).text();
    if (val && val.trim().length > 2) return val.trim();
  }
  return null;
}

/* ================= MAIN PARSER ================= */
function parseHTML(html, url) {
  const $ = cheerio.load(html);

  const title =
    pick($, [
      "meta[property='og:title']",
      "meta[name='twitter:title']",
      "title",
      "h1"
    ]) || "No title";

  const description =
    pick($, [
      "meta[property='og:description']",
      "meta[name='twitter:description']",
      "meta[name='description']"
    ]) || "";

  const image =
    pick($, [
      "meta[property='og:image']",
      "meta[name='twitter:image']"
    ]) || null;

  let site = "unknown";
  let favicon = null;

  try {
    const u = new URL(url);
    site = u.hostname.replace("www.", "");
    favicon = `${u.origin}/favicon.ico`;
  } catch {}

  return {
    title,
    description,
    image,
    site,
    favicon
  };
}

/* ================= FALLBACK ENGINE ================= */
function fallback(html, url) {
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  const text = $("p")
    .map((_, el) => $(el).text())
    .get()
    .filter(t => t.length > 80)[0];

  let site = "unknown";
  let favicon = null;

  try {
    const u = new URL(url);
    site = u.hostname.replace("www.", "");
    favicon = `${u.origin}/favicon.ico`;
  } catch {}

  return {
    title: $("title").text() || "Untitled",
    description: text?.slice(0, 200) || "No description available",
    image: null,
    site,
    favicon
  };
}

/* ================= QUALITY CHECK ================= */
function isWeak(meta) {
  return (
    !meta ||
    !meta.title ||
    meta.title === "No title" ||
    meta.title.length < 3
  );
}

/* ================= CORE ENGINE ================= */
async function getPreview(url) {
  const html = await fetchHTML(url, 6000);

  if (!html) {
    return { success: false, error: "Fetch failed" };
  }

  let meta = parseHTML(html, url);

  if (!isWeak(meta)) {
    return { success: true, metadata: meta };
  }

  meta = fallback(html, url);

  return { success: true, metadata: meta };
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.json({ success: false, error: "No URL" });
  }

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  const cached = cache.get(url);
  if (cached) return safeSend(res, cached);

  try {
    const result = await withTimeout(getPreview(url), 12000);

    cache.set(url, result);

    safeSend(res, result);
  } catch (e) {
    safeSend(res, {
      success: false,
      error: "Timeout / failed"
    });
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("🚀 Enterprise Elite Preview API Running");
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});