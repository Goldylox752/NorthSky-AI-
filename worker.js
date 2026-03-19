const { io } = require('./app'); // Import the io instance

const worker = new Worker('ripper-tasks', async (job) => {
  // ... your ripping logic ...
  const result = await performRip(job.data.url);

  // PUSH the result to the specific user via Socket.io
  io.to(`job-${job.id}`).emit('job-completed', result);

  return result;
}, { connection });
