#!/bin/bash
set -e

# --- Configuration ---
# All sensitive values MUST be set as environment variables before running this script.
# Example: export API_KEY="real-key" && ./deploy.sh
# Or use a .env file (never committed) with: source .env && ./deploy.sh

APP_NAME="${HEROKU_APP_NAME:-my-ripper-engine-$(date +%s)}"
echo "🚀 Starting deployment for $APP_NAME..."

# --- Required environment variables (no defaults!) ---
REQUIRED_VARS=(
  "ADMIN_EMAIL"
  "API_KEY"
  "SENTRY_DSN"
  "REDIS_URL"          # Will be set by Heroku add-on, but check after provisioning
)

# Check they are set
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
  echo "❌ Missing required environment variables:"
  printf '  %s\n' "${MISSING[@]}"
  echo "Please set them (e.g., export API_KEY=...) and re-run."
  exit 1
fi

# --- Heroku login (will open browser if needed) ---
heroku login

# --- Create Heroku app ---
heroku create "$APP_NAME"

# --- Provision add-ons ---
echo "📦 Provisioning Redis..."
heroku addons:create rediscloud:30 --app "$APP_NAME"

echo "✉️ Provisioning SendGrid..."
heroku addons:create sendgrid:starter --app "$APP_NAME"

# --- Set config vars (safely from environment) ---
echo "🔐 Setting config vars..."
heroku config:set \
  ADMIN_EMAIL="$ADMIN_EMAIL" \
  API_KEY="$API_KEY" \
  SENTRY_DSN="$SENTRY_DSN" \
  NODE_ENV="production" \
  --app "$APP_NAME"

# --- Deploy code ---
echo "📤 Pushing code to Heroku..."
git push heroku main

# --- Scale worker dyno ---
echo "⚙️ Scaling background worker..."
heroku ps:scale worker=1 --app "$APP_NAME"

# --- Open the app ---
echo "✅ Deployment complete!"
heroku open --app "$APP_NAME"