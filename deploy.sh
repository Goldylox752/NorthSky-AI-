#!/bin/bash

# --- CONFIGURATION ---
APP_NAME="my-ripper-engine-$(date +%s)" # Generates a unique name
ADMIN_EMAIL="your-email@example.com"
API_KEY="your-secret-key-123"

echo "🚀 Starting Deployment for $APP_NAME..."

# 1. Login to Heroku (Opens browser if not logged in)
heroku login

# 2. Create the Heroku App
heroku create $APP_NAME

# 3. Add Redis (Free 30MB instance)
echo "📦 Provisioning Redis..."
heroku addons:create rediscloud:30

# 4. Add SendGrid (Free 100 emails/day)
echo "✉️ Provisioning SendGrid..."
heroku addons:create sendgrid:starter

# 5. Set Environment Variables
echo "🔐 Setting Config Vars..."
heroku config:set ADMIN_EMAIL=$ADMIN_EMAIL
heroku config:set API_KEY=$API_KEY
heroku config:set NODE_ENV=production

# 6. Deploy Code
echo "📤 Pushing code to Heroku..."
git add .
git commit -m "Production deployment with workers and dashboard"
git push heroku main

# 7. Scale Workers
# This is crucial! Web runs by default, but Worker must be manually scaled.
echo "⚙️ Scaling background worker..."
heroku ps:scale worker=1

# 8. Open Dashboard
echo "✅ Deployment Complete!"
heroku open
