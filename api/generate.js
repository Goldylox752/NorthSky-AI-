import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    // 1. Get API key from headers
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        error: "Missing API key"
      });
    }

    // 2. Validate key in database
    const { data: keyData, error } = await supabase
      .from("api_keys")
      .select("user_id, active")
      .eq("api_key", apiKey)
      .eq("active", true)
      .single();

    if (error || !keyData) {
      return res.status(403).json({
        error: "Invalid or inactive API key"
      });
    }

    // 3. OPTIONAL: rate limit per user (important for SaaS)
    // (you can add Redis or Supabase counter later)

    // 4. Run your AI logic safely
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Missing message"
      });
    }

    // 🔥 YOUR CORE AI RESPONSE LOGIC HERE
    const reply = `NorthSky Secure AI Response:\n\n${message}`;

    return res.status(200).json({
      reply
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error"
    });
  }
}
