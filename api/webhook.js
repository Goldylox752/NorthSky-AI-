require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// =========================
// ENV CHECK
// =========================
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "AI_API_URL",
  "AI_API_KEY",
  "STRIPE_WEBHOOK_SECRET"
];

required.forEach((k) => {
  if (!process.env[k]) {
    console.error(`Missing ENV: ${k}`);
    process.exit(1);
  }
});

// =========================
// MIDDLEWARE
// =========================
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});

// =========================
// SUPABASE (SERVER FULL ACCESS)
// =========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =========================
// AUTH: PAID USER CHECK
// =========================
async function requirePaidUser(req, res, next) {
  const email = req.headers["x-user-email"];

  if (!email) {
    return res.status(401).json({ error: "Missing user email" });
  }

  const { data, error } = await supabase
    .from("users")
    .select("email, paid, plan")
    .eq("email", email)
    .single();

  if (error || !data) {
    return res.status(403).json({ error: "User not found" });
  }

  if (!data.paid) {
    return res.status(403).json({ error: "Payment required" });
  }

  req.user = data;
  next();
}

// =========================
// AI ROUTE (FIXED)
// =========================
app.post("/api/ai", limiter, requirePaidUser, async (req, res) => {
  try {
    const { message, mode } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // FIXED MODE MAPPING
    const safeMode =
      mode === "analyze"
        ? "analysis"
        : mode === "search"
        ? "reasoning"
        : "chat";

    const ai = await axios.post(
      process.env.AI_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are running in ${safeMode} mode. Respond clearly and concisely.`
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = ai.data?.choices?.[0]?.message?.content || "No response";

    // LOG USAGE
    await supabase.from("usage_logs").insert([
      {
        email: req.user.email,
        plan: req.user.plan,
        prompt: message,
        mode: safeMode,
        created_at: new Date().toISOString()
      }
    ]);

    res.json({
      success: true,
      reply,
      plan: req.user.plan
    });
  } catch (err) {
    console.error("AI ERROR:", err?.response?.data || err.message);

    res.status(500).json({
      error: "AI service failure"
    });
  }
});

// =========================
// STRIPE WEBHOOK (FIXED + CLEAN PLAN MAPPING)
// =========================
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const sig = req.headers["stripe-signature"];

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type !== "checkout.session.completed") {
        return res.json({ received: true });
      }

      const session = event.data.object;

      const email = session.customer_details?.email || session.customer_email;
      const amount = session.amount_total;

      if (!email) {
        return res.json({ error: "missing_email" });
      }

      // ✅ FIXED MAPPING (THIS WAS YOUR MAIN ISSUE)
      let plan = "elite";

      if (amount === 9900) plan = "starter";
      if (amount === 29900) plan = "pro";
      if (amount >= 99900) plan = "elite";

      await supabase.from("users").upsert({
        email,
        paid: true,
        plan,
        updated_at: new Date().toISOString()
      });

      console.log("🔥 UPGRADED:", email, plan);

      res.json({ received: true, plan });
    } catch (err) {
      console.error("WEBHOOK ERROR:", err.message);
      res.status(400).send("Webhook error");
    }
  }
);

// =========================
// HEALTH CHECK
// =========================
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "northsky-ai" });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 NorthSky AI running on port ${PORT}`);
});