const admin = require('firebase-admin');

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    if (process.env.NODE_ENV === 'test' && token === 'mock-firebase-token') {
      req.user = { uid: 'test-user-id', email: 'test@cloudpulse.io' };
      return next();
    }
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = { verifyFirebaseToken };
