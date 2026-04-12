const { Worker } = require("bullmq");
const Redis = require("ioredis");
const axios = require("axios");
const cheerio = require("cheerio");

const connection = new Redis(process.env.REDIS_URL);

function parse(html, url) {
  const $ = cheerio.load(html);

  return {
    title: $("title").text(),
    description:
      $("meta[name='description']").attr("content") || "",
    image:
      $("meta[property='og:image']").attr("content") || null,
    site: new URL(url).hostname
  };
}

new Worker(
  "scrapeQueue",
  async job => {
    const { url, key } = job.data;

    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const result = {
      success: true,
      metadata: parse(data, url)
    };

    // store in redis cache
    await connection.set(key, JSON.stringify(result), "EX", 3600);

    return result;
  },
  { connection }
);

console.log("⚡ WORKER RUNNING");