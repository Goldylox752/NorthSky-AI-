web: node app.js
```

### 3. Deploy via Heroku CLI
Open your terminal in the project folder and run:
1.  **Login:** `heroku login`
2.  **Create App:** `heroku create your-app-name`
3.  **Add Redis:** Use an add-on like [Redis Cloud](https://devcenter.heroku.com/articles/rediscloud):
    `heroku addons:create rediscloud:30` (creates a free 30MB instance).
4.  **Set Your API Key:**
    `heroku config:set API_KEY=your-secret-key-123`
5.  **Push Code:** `git push heroku main`

### 4. Connect the Client
If you used **Redis Cloud**, the add-on provides a variable named `REDISCLOUD_URL`. Ensure your code uses this specific name to connect.

Would you like to know how to **set up a GitHub Action** so that your app automatically redeploys every time you push a change to your repository?
