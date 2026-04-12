const { Worker } = require("bullmq");
const Redis = require("ioredis");
const axios = require("axios");
const cheerio = require("cheerio");

const connection = new Redis(process.env.REDIS_URL);

/* WORKER = background scraper */
new Worker(
  "scrapeQueue",
  async job => {
    const { url } = job.data;

    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const $ = cheerio.load(data);

    return {
      title: $("title").text(),
      description: $("meta[name='description']").attr("content") || "",
      image: $("meta[property='og:image']").attr("content") || null
    };
  },
  { connection }
);