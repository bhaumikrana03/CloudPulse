const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { apiLimiter, globalCircuitBreaker } = require('./middleware/protection');
const { verifyFirebaseToken } = require('./middleware/auth');
const { LoadBalancer } = require('./services/loadBalancer');
const { login, verifyToken, requireAdmin, config: authConfig } = require('./services/adminAuth');
const createLbRouter = require('./routes/lb');
const { exportMetricsToS3 } = require('./services/s3Export');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] }
});

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'CloudPulse API', version: '1.0.0', description: 'Cloud load balancer & traffic analytics engine' },
    servers: [{ url: 'http://localhost:5001' }]
  },
  apis: ['./src/server.js', './src/routes/*.js']
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

const serversRegistry = [
  { id: 'srv-01', name: 'us-east-primary', region: 'Virginia', ip: '192.168.1.10', cap: 40 },
  { id: 'srv-02', name: 'eu-west-worker', region: 'Dublin', ip: '192.168.2.20', cap: 32 },
  { id: 'srv-03', name: 'ap-south-edge', region: 'Mumbai', ip: '192.168.3.30', cap: 24 },
  { id: 'srv-04', name: 'sa-east-edge', region: 'Sao Paulo', ip: '192.168.4.40', cap: 16 }
];

const lb = new LoadBalancer(serversRegistry, {
  onState: (state) => io.emit('lb:state', state),
  onEvent: (evt) => io.emit('lb:event', evt)
});
if (process.env.NODE_ENV !== 'test') lb.start(1000);

// Admin sign-in (stricter limit) and the load balancer API come before the general limiter.
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many sign-in attempts. Try again later.' } }), login);
app.use('/api/lb', createLbRouter(lb, requireAdmin));
if (process.env.NODE_ENV !== 'test') app.use('/api/', apiLimiter);

app.get('/api/metrics/summary', async (req, res) => {
  try {
    const data = await globalCircuitBreaker.execute(async () => {
      const snap = lb.snapshot();
      const up = snap.servers.filter((s) => s.status === 'healthy');
      const util = up.length ? Math.round((up.reduce((n, s) => n + s.load / s.cap, 0) / up.length) * 100) : 0;
      return {
        activeServers: up.length,
        totalServers: snap.servers.length,
        avgUtilization: util,
        dispatched: snap.dispatched,
        rejected: snap.rejected,
        status: up.length ? 'OPERATIONAL' : 'DEGRADED'
      };
    });
    res.json(data);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post('/api/export/s3', verifyFirebaseToken, async (req, res) => {
  try {
    const result = await exportMetricsToS3({ exportedAt: new Date().toISOString(), ...lb.snapshot() });
    res.json({ message: 'Export successful', ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve the dashboard from the same address as the API (when the frontend folder sits next to backend).
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get('/', (req, res) => res.redirect('/login.html'));
}

io.use((socket, next) => (verifyToken(socket.handshake.auth && socket.handshake.auth.token) ? next() : next(new Error('unauthorized'))));
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('lb:state', lb.snapshot());
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  server.listen(PORT, () => {
    console.log(`CloudPulse backend running on port ${PORT}`);
    if (authConfig().usingDefaults) console.log('Sign in with username "admin" and password "1234". Set ADMIN_USERNAME and ADMIN_PASSWORD to change them.');
  });
}

module.exports = { app, server, io, lb };
