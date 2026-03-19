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
