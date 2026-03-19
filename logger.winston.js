const winston = require('winston');

// 1. Simple Logger Setup (to fix the 'logger' is not defined error)
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'audit.log' }),
    new winston.transports.Console()
  ]
});

// 2. Simple API Key Middleware (to fix the 'authenticate' is not defined error)
const API_KEY = 'your-secret-key-123'; // In production, use process.env.API_KEY

const authenticate = (req, res, next) => {
  const userKey = req.headers['x-api-key'];
  if (userKey && userKey === API_KEY) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
};
