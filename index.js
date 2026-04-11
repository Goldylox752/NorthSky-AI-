/* ================= IMPORTS ================= */
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const metascraper = require("metascraper")([
  require("metascraper-title")(),
  require("metascraper-description")(),
  require("metascraper-image")(),
]);

const app = express();
app.use(cors());
app.set("trust proxy", true);

/* ================= CACHE ================= */
const cache = {};
const CACHE_TIME = 1000 * 60 * 20;

/* ================= RATE LIMIT ================= */
const usage = {};
app.use("/api/", (req, res, next) => {
  const ip = req.ip;
  usage[ip] = (usage[ip] || 0) + 1;
  if (usage[ip] > 150) {
    return res.status(429).json({ success: false });
  }
  next();
});

/* ================= UTIL ================= */
function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function raceRequests(promises, ms = 10000) {
  return Promise.race([
    Promise.any(promises),
    timeout(ms)
  ]);
}

function detectPlatform(url) {
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  return "web";
}

/* ================= TIKTOK (MULTI API) ================= */

async function tiktokAPI1(url) {
  try {
    const { data } = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      { timeout: 8000 }
    );
    if (data?.data) {
      return {
        title: data.data.title,
        image: data.data.cover,
        video: data.data.play,
        download: data.data.play,
        author: data.data.author?.nickname,
      };
    }
  } catch {}
  return null;
}

async function tiktokAPI2(url) {
  try {
    const { data } = await axios.get(
      `https://tikdown.org/api/download?url=${encodeURIComponent(url)}`,
      { timeout: 8000 }
    );
    if (data?.video) {
      return {
        title: "TikTok Video",
        video: data.video,
        download: data.video,
      };
    }
  } catch {}
  return null;
}

async function handleTikTok(url) {
  const result = await raceRequests([
    tiktokAPI1(url),
    tiktokAPI2(url),
  ]);

  return result || {
    title: "TikTok Video",
    platform: "tiktok",
  };
}

/* ================= INSTAGRAM ================= */

async function handleInstagram(url) {
  try {
    const { data } = await axios.get(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      { timeout: 8000 }
    );

    const img = data.match(/"og:image" content="(.*?)"/)?.[1];

    return {
      title: "Instagram Post",
      image: img || null,
    };
  } catch {
    return { title: "Instagram Content" };
  }
}

/* ================= YOUTUBE ================= */

async function handleYouTube(url) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { timeout: 8000 }
    );

    return {
      title: data.title,
      image: data.thumbnail_url,
      author: data.author_name,
    };
  } catch {
    return { title: "YouTube Video" };
  }
}

/* ================= WEB SCRAPER ================= */

async function fetchDirect(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 7000,
    });
    return data;
  } catch {}
  return null;
}

async function fetchProxy(url) {
  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxy, { timeout: 9000 });
    return data;
  } catch {}
  return null;
}

async function fetchSmart(url) {
  return raceRequests([
    fetchDirect(url),
    fetchProxy(url)
  ]);
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("🚀 NorthSky COBALT API");
});

app.get("/api/rip", async (req, res) => {
  const kill = setTimeout(() => {
    res.json({ success: false, error: "timeout" });
  }, 12000);

  try {
    let { url } = req.query;
    if (!url) return res.json({ success: false });

    if (!url.startsWith("http")) url = "https://" + url;

    const cached = cache[url];
    if (cached && Date.now() - cached.t < CACHE_TIME) {
      clearTimeout(kill);
      return res.json(cached.d);
    }

    const platform = detectPlatform(url);

    let data = null;

    if (platform === "tiktok") data = await handleTikTok(url);
    if (platform === "instagram") data = await handleInstagram(url);
    if (platform === "youtube") data = await handleYouTube(url);

    if (data) {
      const resData = {
        success: true,
        platform,
        metadata: data,
        video: data.video || null,
        download: data.download || null,
      };

      cache[url] = { d: resData, t: Date.now() };

      clearTimeout(kill);
      return res.json(resData);
    }

    /* WEB */
    const html = await fetchSmart(url);

    let meta = { title: "Unknown" };

    if (html) {
      try {
        const m = await metascraper({ html, url });
        meta = {
          title: m.title,
          description: m.description,
          image: m.image,
        };
      } catch {}
    }

    const resData = {
      success: true,
      platform: "web",
      metadata: meta,
    };

    cache[url] = { d: resData, t: Date.now() };

    clearTimeout(kill);
    res.json(resData);

  } catch (e) {
    clearTimeout(kill);
    res.json({ success: false });
  }
});

/* ================= START ================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 COBALT SERVER LIVE");
});