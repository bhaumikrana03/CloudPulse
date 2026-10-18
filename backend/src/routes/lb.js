const express = require('express');
const rateLimit = require('express-rate-limit');

module.exports = function createLbRouter(lb, requireAdmin) {
  const router = express.Router();
  router.use(
    rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } }),
    requireAdmin
  );
  const run = (fn) => (req, res) => {
    try { res.json(fn(req)); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  };
  router.get('/state', run(() => lb.snapshot()));
  router.post('/dispatch', run((req) => lb.dispatchBatch(req.body.count, req.body.cost)));
  router.post('/algorithm', run((req) => lb.setAlgo(req.body.algo)));
  router.post('/traffic', run((req) => lb.setRate(req.body.rate)));
  router.post('/running', run((req) => lb.setRunning(req.body.running)));
  router.post('/servers/:id/:action', run((req) => lb.control(req.params.id, req.params.action)));
  return router;
};
