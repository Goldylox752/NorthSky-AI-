import Stripe from "stripe";
import { buffer } from "micro";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =========================
// PLANS CONFIG (SaaS CORE)
// =========================
const PLANS = {
  pro: {
    limit: 1000
  },
  free: {
    limit: 10
  }
};

// =========================
// WEBHOOK HANDLER
// =========================
export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    const rawBody = await buffer(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // =========================
  // ONLY HANDLE SUCCESS PAYMENTS
  // =========================
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  const email =
    session.customer_details?.email ||
    session.customer_email;

  if (!email) {
    console.error("❌ Missing email in Stripe session");
    return res.status(200).json({ received: true });
  }

  const plan = session.metadata?.plan || "pro";

  // =========================
  // IDENTITY SAFE UPSERT
  // =========================
  const apiKey = crypto.randomBytes(32).toString("hex");

  const { error } = await supabase.from("api_keys").upsert({
    email,
    api_key: apiKey,
    plan,
    request_limit: PLANS[plan].limit,
    usage: 0,
    stripe_session_id: session.id,
    updated_at: new Date().toISOString()
  }, {
    onConflict: "email"
  });

  if (error) {
    console.error("❌ Supabase error:", error);
    return res.status(500).json({ error: "db_error" });
  }

  console.log("🔥 USER UPGRADED:", email, "PLAN:", plan);

  return res.status(200).json({
    received: true,
    upgraded: true
  });
}
