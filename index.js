const axios = require("axios");
const cheerio = require("cheerio");

/* ================= CACHE ================= */
const cache = new Map();
const CACHE_TIME = 1000 * 60 * 60;

function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > CACHE_TIME) {
    cache.delete(key);
    return null;
  }
  return v.d;
}

function setCache(key, data) {
  cache.set(key, { d: data, t: Date.now() });
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    return data;
  } catch {
    return null;
  }
}

/* ================= DOMAIN ================= */
function cleanDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

/* ================= IMAGE PICKER ================= */
function bestImage($) {
  return (
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    $("img")
      .first()
      .attr("src") ||
    null
  );
}

/* ================= TITLE PICKER ================= */
function bestTitle($) {
  return (
    $("meta[property='og:title']").attr("content") ||
    $("meta[name='twitter:title']").attr("content") ||
    $("title").text() ||
    $("h1").first().text() ||
    "No title"
  );
}

/* ================= DESCRIPTION PICKER ================= */
function bestDescription($) {
  return (
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='twitter:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("p")
      .first()
      .text()
      .slice(0, 180) ||
    ""
  );
}

/* ================= FAVICON ================= */
function getFavicon(url) {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/* ================= READABLE TEXT ================= */
function bestText($) {
  $("script, style, noscript, iframe").remove();

  const paragraphs = $("p")
    .map((i, el) => $(el).text().trim())
    .get()
    .filter(p => p.length > 80);

  return paragraphs[0] || "";
}

/* ================= ELITE PARSER ================= */
function parse(html, url) {
  const $ = cheerio.load(html);

  const title = bestTitle($);
  const description = bestDescription($);
  const image = bestImage($);
  const site = cleanDomain(url);
  const favicon = getFavicon(url);
  const text = bestText($);

  return {
    title: title?.trim(),
    description: description?.trim() || text.slice(0, 180),
    image,
    site,
    favicon
  };
}

/* ================= QUALITY CHECK ================= */
function isWeak(meta) {
  return !meta || meta.title === "No title" || meta.title.length < 2;
}

/* ================= MAIN ENGINE ================= */
async function getPreview(url) {
  const html = await fetchHTML(url);

  if (!html) {
    return { success: false, error: "Fetch failed" };
  }

  const meta = parse(html, url);

  if (isWeak(meta)) {
    return {
      success: false,
      error: "No usable metadata"
    };
  }

  return {
    success: true,
    metadata: meta
  };
}

/* ================= ROUTE ================= */
app.get("/api/rip", async (req, res) => {
  let { url } = req.query;

  if (!url) return res.json({ success: false });

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  const cached = getCache(url);
  if (cached) return res.json(cached);

  try {
    const result = await getPreview(url);
    setCache(url, result);
    res.json(result);
  } catch (e) {
    res.json({
      success: false,
      error: "Server error"
    });
  }
});