/* Admin sign-in for the dashboard. Credentials come from environment variables;
   tokens are HMAC-signed and expire after 12 hours. */
const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000;
const secret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

function config() {
  return {
    email: process.env.ADMIN_EMAIL || '',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '1234',
    usingDefaults: !process.env.ADMIN_PASSWORD,
  };
}

const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();

function issueToken(sub) {
  const payload = Buffer.from(JSON.stringify({ sub, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp > Date.now() ? d : null; } catch (_) { return null; }
}

function login(req, res) {
  const c = config();
  const { identifier, password } = req.body || {};
  const id = String(identifier || '').trim().toLowerCase();
  const idOk = [c.email, c.username].filter(Boolean).some((v) => v.toLowerCase() === id);
  const pwOk = crypto.timingSafeEqual(digest(password || ''), digest(c.password));
  if (!idOk || !pwOk) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json({ token: issueToken(c.email || c.username), expiresInHours: 12 });
}

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || '';
  const user = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  req.admin = user; next();
}

module.exports = { login, verifyToken, requireAdmin, config };
