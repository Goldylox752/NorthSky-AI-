import { buffer } from 'micro';
import Stripe from 'stripe';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const buf = await buffer(req);

    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✅ EVENT:", event.type);

  } catch (err) {
    console.error("❌ STRIPE ERROR:", err.message);
    return res.status(400).send(err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log("💰 PAYMENT SUCCESS:", session.id);

    const apiKey = crypto.randomBytes(32).toString('hex');

    const email =
      session.customer_details?.email || session.customer_email;

    // ✅ FIXED INSERT
    const { error } = await supabase.from('api_keys').insert({
      stripe_session_id: session.id,
      email: email,
      api_key: apiKey,
      user_id: session.id, // 🔥 REQUIRED
      plan: 'pro'
    });

    if (error) {
      console.error("❌ SUPABASE ERROR:", error);
    } else {
      console.log("🔥 API KEY CREATED:", apiKey);
    }
  }

  res.status(200).json({ received: true });
}