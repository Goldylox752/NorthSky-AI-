const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const transporter = require('./src/mailer');

// ... your existing worker logic ...

worker.on('completed', async (job) => {
  // Only send email for "massive" rips (e.g., if it took a long time or is a specific type)
  console.log(`Job ${job.id} finished. Sending notification...`);

  try {
    await transporter.sendMail({
      from: '"Ripper Bot" <alerts@your-app.com>',
      to: process.env.ADMIN_EMAIL, // Your email address
      subject: `✅ Rip Complete: ${job.data.url.substring(0, 30)}...`,
      html: `
        <h3>Your Rip is Ready!</h3>
        <p><strong>URL:</strong> ${job.data.url}</p>
        <p><strong>Job ID:</strong> ${job.id}</p>
        <a href="https://your-app.herokuapp.com">View on Dashboard</a>
      `
    });
    console.log("Email sent successfully!");
  } catch (err) {
    console.error("Failed to send email notification:", err);
  }
});

// List of proxies (format: http://user:pass@host:port)
const proxies = [
  process.env.PROXY_1, 
  process.env.PROXY_2,
  process.env.PROXY_3
];

const worker = new Worker('ripper-tasks', async (job) => {
  const attempt = job.attemptsMade; // 0 for first try, 1 for second...
  const proxyUrl = proxies[attempt % proxies.length];
  
  // Choose User-Agent and Proxy for this specific attempt
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
  
  await job.updateProgress({ 
    status: `Attempt ${attempt + 1}: ${proxyUrl ? 'Using Proxy Tunnel' : 'Direct Connection'}...` 
  });

  try {
    // Pass the proxy agent to your axios/metascraper call
    const { data } = await axios.get(job.data.url, {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0...' }
    });
    
    // ... process data ...
    return result;
  } catch (error) {
    const isRateLimited = error.response?.status === 429;
    await job.updateProgress({ 
      status: `Blocked (Status ${error.response?.status || 'Timeout'}). Retrying shortly...` 
    });
    
    // Throw error so BullMQ triggers the 'backoff' delay we set in the Queue
    throw new Error(isRateLimited ? 'Rate Limited' : 'Connection Failed');
  }
}, { connection });

const { io } = require('./app'); // Import the io instance
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...', // Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...', // Safari
  'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/...' // Firefox
];

const worker = new Worker('ripper-tasks', async (job) => {
  // Use job.attemptsMade to pick a different User-Agent each time
  const uaIndex = job.attemptsMade % userAgents.length;
  const currentUA = userAgents[uaIndex];

  await job.updateProgress({ status: `Attempt ${job.attemptsMade + 1}: Using ${uaIndex === 0 ? 'Chrome' : 'Firefox'} agent...` });

  try {
    // Pass the unique User-Agent to your ripping logic
    const result = await performRip(job.data.url, currentUA);
    return result;
  } catch (error) {
    console.error(`Attempt ${job.attemptsMade + 1} failed for ${job.id}`);
    throw error; // Throwing the error triggers the 'backoff' retry
  }
}, { connection });

const worker = new Worker('ripper-tasks', async (job) => {
  // ... your ripping logic ...
  const result = await performRip(job.data.url);

  // PUSH the result to the specific user via Socket.io
  io.to(`job-${job.id}`).emit('job-completed', result);

  return result;
}, { connection });
const worker = new Worker('ripper-tasks', async (job) => {
  // Step 1: Initializing
  await job.updateProgress({ status: 'Initializing Ripper...' });
  
  // Step 2: Ripping (e.g., Axios or yt-dlp)
  await job.updateProgress({ status: 'Scraping HTML & Metadata...' });
  const result = await performRip(job.data.url);
  
  // Step 3: Caching
  await job.updateProgress({ status: 'Uploading to Redis Cache...' });
  await connection.set(`result:${job.id}`, JSON.stringify(result), 'EX', 3600);

  return result;
}, { connection });
