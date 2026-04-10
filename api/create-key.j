import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const { userId } = req.body;

  const newKey = crypto.randomBytes(32).toString('hex');

  await supabase.from('api_keys').insert({
    user_id: userId,
    api_key: newKey,
    plan: "free"
  });

  res.status(200).json({ api_key: newKey });
}