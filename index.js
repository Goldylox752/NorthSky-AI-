/* ================= CORE ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const cors = require("cors");
const Stripe = require("stripe");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 3000;

/* ================= RAW WEBHOOK (MUST BE FIRST) ================= */
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const apiKey = session.metadata?.apiKey;

      if (apiKey && users.has(apiKey)) {
        const user = users.get(apiKey);

        user.plan = "pro";
        user.limit = 1000;
        user.usage = 0;

        users.set(apiKey, user);

        console.log("💳 PRO UPGRADE:", apiKey);
      }
    }

    res.json({ received: true });
  }
);

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= USERS DB ================= */
const users = new Map();

/*
User schema:
{
  apiKey,
  plan: "free" | "pro",
  usage: number,
  limit: number
}
*/

/* ================= CREATE USER ================= */
app.post("/api/create-user", (req, res) => {
  const apiKey = uuidv4();

  users.set(apiKey, {
    apiKey,
    plan: "free",
    usage: 0,
    limit: 10
  });

  res.json({
    success: true,
    apiKey,
    plan: "free",
    limit: 10
  });
});

/* ================= AUTH + LIMIT MIDDLEWARE ================= */
function requireAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || !users.has(apiKey)) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const user = users.get(apiKey);

  if (user.usage >= user.limit) {
    return res.status(429).json({
      error: "limit_reached",
      plan: user.plan
    });
  }

  user.usage++;
  users.set(apiKey, user);

  req.user = user;
  next();
}

/* ================= STRIPE CHECKOUT ($29/MO) ================= */
app.post("/api/subscribe", async (req, res) => {
  const { apiKey } = req.body;

  if (!users.has(apiKey)) {
    return res.status(400).json({ error: "invalid_user" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "NorthSky AI Pro ($29/month)"
          },
          unit_amount: 2900,
          recurring: {
            interval: "month"
          }
        },
        quantity: 1
      }
    ],
    metadata: {
      apiKey
    },
    success_url: `${process.env.BASE_URL}/success`,
    cancel_url: `${process.env.BASE_URL}/cancel`
  });

  res.json({ url: session.url });
});

/* ================= CACHE ================= */
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30;

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) return null;
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

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });

    return res.data;
  } catch {
    return null;
  }
}

/* ================= PARSER ================= */
function parseHTML(html, url) {
  const $ = cheerio.load(html);

  return {
    title:
      $("meta[property='og:title']").attr("content") ||
      $("title").text() ||
      "Untitled",

    description:
      $("meta[name='description']").attr("content") || "",

    image:
      $("meta[property='og:image']").attr("content") || null,

    site: new URL(url).hostname.replace("www.", "")
  };
}

/* ================= ANALYSIS ENGINE ================= */
function analyze(html, url) {
  const $ = cheerio.load(html);

  const title = $("title").text();
  const desc = $("meta[name='description']").attr("content") || "";
  const h1 = $("h1").length;
  const imgs = $("img").length;
  const links = $("a").length;
  const ssl = url.startsWith("https");

  let seo = 50;
  let ux = 50;
  let conv = 50;

  if (title.length > 10) seo += 15;
  if (desc.length > 20) seo += 15;
  if (h1 > 0) seo += 10;

  if (imgs > 0) ux += 15;
  if (h1 > 0) ux += 10;

  if (links > 3) conv += 10;
  if (ssl) conv += 10;

  return {
    seo: Math.min(seo, 100),
    ux: Math.min(ux, 100),
    conv: Math.min(conv, 100)
  };
}

/* ================= SCRAPE ================= */
async function scrape(url) {
  const html = await fetchHTML(url);
  if (!html) return { success: false, error: "fetch_failed" };

  return {
    success: true,
    metadata: parseHTML(html, url)
  };
}

/* ================= ROUTES ================= */

/* SCRAPE */
app.get("/api/rip", async (req, res) => {
  const url = normalizeURL(req.query.url);
  if (!url) return res.status(400).json({ error: "invalid_url" });

  const key = crypto.createHash("md5").update(url).digest("hex");

  const cached = getCache(key);
  if (cached) return res.json({ cached: true, ...cached });

  const result = await scrape(url);

  setCache(key, result);
  res.json(result);
});

/* ANALYZE (PROTECTED) */
app.post("/api/analyze", requireAuth, async (req, res) => {
  const url = normalizeURL(req.body.site);
  if (!url) return res.status(400).json({ error: "invalid_url" });

  const html = await fetchHTML(url);
  if (!html) return res.status(500).json({ error: "fetch_failed" });

  const meta = parseHTML(html, url);
  const scores = analyze(html, url);

  res.json({
    success: true,
    meta,
    scores,
    result: `
SEO Score: ${scores.seo}/100
UX Score: ${scores.ux}/100
Conversion Score: ${scores.conv}/100
    `.trim()
  });
});

/* USER STATUS */
app.get("/api/me", (req, res) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || !users.has(apiKey)) {
    return res.status(401).json({ error: "invalid_user" });
  }

  const user = users.get(apiKey);

  res.json({
    plan: user.plan,
    usage: user.usage,
    limit: user.limit,
    remaining: user.limit - user.usage
  });
});

/* HEALTH */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    users: users.size,
    cache: cache.size
  });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 NorthSky OS SaaS v3 running on port ${PORT}`);
});