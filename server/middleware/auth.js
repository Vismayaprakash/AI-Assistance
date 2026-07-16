const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb } = require('../database/init');
const { v4: uuidv4 } = require('uuid');

/**
 * Ensure the default admin user exists
 */
function ensureDefaultUser() {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(config.dashboardUsername);

  if (!existing) {
    const hash = bcrypt.hashSync(config.dashboardPassword, 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), config.dashboardUsername, hash, 'superadmin');
    console.log(`✅ Default admin user created: ${config.dashboardUsername}`);
  }
}

/**
 * Authenticate user and return JWT token
 */
function login(username, password) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return null;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, businessId: user.business_id },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  return { token, user: { id: user.id, username: user.username, role: user.role, business_id: user.business_id } };
}

/**
 * JWT authentication middleware
 */
function authMiddleware(req, res, next) {
  // Skip auth for login route and static files
  if (req.path === '/api/auth/login' || req.path.startsWith('/dashboard/') || req.path.startsWith('/widget/')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also check cookie
  const cookieToken = req.cookies?.token;
  const finalToken = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(finalToken, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth — doesn't block, just attaches user if token present
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      // Ignore invalid tokens for optional auth
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth, login, ensureDefaultUser };
