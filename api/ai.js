import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import axios from "axios";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =======================
// SIMPLE CACHE
// =======================
const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  // optional TTL (10 min)
  if (Date.now() - item.time > 10 * 60 * 1000) {
    cache.delete(key);
    return null;
  }

  return item;
}

function setCache(key, value) {
  cache.set(key, {
    value,
    time: Date.now()
  });
}

// =======================
// DEEPSEEK (SAFE)
// =======================
async function runDeepSeek(prompt) {
  try {
    const res = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert AI for business, SEO, UX, marketing, and SaaS growth."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("DeepSeek error:", err?.response?.data || err.message);
    return null;
  }
}

// =======================
// OPENAI FALLBACK (SAFE)
// =======================
async function runOpenAI(prompt) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a reliable fallback AI assistant."
        },
        { role: "user", content: prompt }
      ]
    });

    return res.choices?.[0]?.message?.content || "No response";
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return "AI fallback failed";
  }
}

// =======================
// AI ROUTER
// =======================
async function aiRouter(prompt) {
  const deepseek = await runDeepSeek(prompt);

  if (deepseek) {
    return {
      provider: "deepseek",
      model: "deepseek-chat",
      reply: deepseek
    };
  }

  const openaiReply = await runOpenAI(prompt);

  return {
    provider: "openai",
    model: "gpt-4o-mini",
    reply: openaiReply
  };
}

// =======================
// MAIN HANDLER
// =======================
export default async function handler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json");

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "method_not_allowed"
      });
    }

    // =======================
    // API KEY AUTH
    // =======================
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "missing_api_key"
      });
    }

    // FIX: safer Supabase query (NO .single crash)
    const { data: users, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("api_key", apiKey)
      .limit(1);

    const user = users?.[0];

    if (error || !user) {
      return res.status(403).json({
        success: false,
        error: "invalid_api_key"
      });
    }

    // =======================
    // INPUT
    // =======================
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "missing_prompt"
      });
    }

    // =======================
    // LIMIT CHECK
    // =======================
    if (user.requests_used >= user.request_limit) {
      return res.status(429).json({
        success: false,
        error: "limit_reached",
        plan: user.plan
      });
    }

    // =======================
    // CACHE
    // =======================
    const key = crypto.createHash("md5").update(prompt).digest("hex");
    const cached = getCache(key);

    if (cached) {
      return res.json({
        success: true,
        cached: true,
        ...cached.value
      });
    }

    // =======================
    // AI CALL
    // =======================
    const ai = await aiRouter(prompt);

    // =======================
    // UPDATE USAGE
    // =======================
    await supabase
      .from("api_keys")
      .update({
        requests_used: (user.requests_used || 0) + 1
      })
      .eq("api_key", apiKey);

    // =======================
    // LOG
    // =======================
    await supabase.from("usage_logs").insert({
      api_key: apiKey,
      provider: ai.provider,
      model: ai.model,
      prompt
    });

    // =======================
    // RESPONSE
    // =======================
    const result = {
      success: true,
      provider: ai.provider,
      model: ai.model,
      reply: ai.reply,
      usage: (user.requests_used || 0) + 1,
      limit: user.request_limit,
      remaining: user.request_limit - ((user.requests_used || 0) + 1)
    };

    setCache(key, result);

    return res.status(200).json(result);

  } catch (err) {
    console.error("FATAL SERVER ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "server_crash",
      details: err?.message || "unknown_error"
    });
  }
}
