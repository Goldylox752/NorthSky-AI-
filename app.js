const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ripQueue, connection } = require('./src/queue');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// 1. WebSocket Room Management
io.on('connection', (socket) => {
  socket.on('join-job', (jobId) => socket.join(`job-${jobId}`));
});

// 2. The Rip API
app.get('/rip', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // Add to background queue
  const job = await ripQueue.add('rip-url', { url });
  res.json({ jobId: job.id });
});

// 3. Status Endpoint (Fallback)
app.get('/status/:id', async (req, res) => {
  const result = await connection.get(`result:${req.params.id}`);
  res.json(result ? JSON.parse(result) : { status: 'processing' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard Live: http://localhost:${PORT}`));

// Export io for the worker (if running in same process for testing)
module.exports = { io };

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Allow your dashboard to connect
});

// Listen for connections
io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id);
  
  // Join a "room" based on Job ID so users only get THEIR results
  socket.on('join-job', (jobId) => {
    socket.join(`job-${jobId}`);
    console.log(`Socket ${socket.id} joined room job-${jobId}`);
  });
});
const { QueueEvents } = require('bullmq');
const queueEvents = new QueueEvents('ripper-tasks', { connection });

queueEvents.on('progress', ({ jobId, data }) => {
  // 'data' is the object { status: "..." } from the worker
  io.to(`job-${jobId}`).emit('job-progress', data.status);
});

// IMPORTANT: Export io so the worker or routes can use it
module.exports = { app, server, io };

app.get('/rip', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const cachedData = await redisClient.get(url);
    if (cachedData) return res.json({ source: 'cache', ...JSON.parse(cachedData) });

    // ... (Your existing ripping logic here) ...

    // Save to Cache
    await redisClient.setEx(url, 86400, JSON.stringify(ripResult));

    // NEW: Add to Recent List (Limit to 5)
    await redisClient.lPush('recent_rips', url);
    await redisClient.lTrim('recent_rips', 0, 4); 

    return res.json({ source: 'fresh', ...ripResult });
  } catch (error) {
    res.status(500).json({ error: 'Rip failed', details: error.message });
  }queueEvents.on('failed', ({ jobId, failedReason }) => {
  io.to(`job-${jobId}`).emit('job-error', `All retries failed: ${failedReason}`);
});

// NEW: Add endpoint to fetch the list
app.get('/dashboard/recent', authenticate, async (req, res) => {
  const recent = await redisClient.lRange('recent_rips', 0, 4);
  res.json(recent);
});
