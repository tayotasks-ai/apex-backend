// ── auth.js ───────────────────────────────────────────────────────────────────
const { verifyToken } = require('../utils/token');
const { ApiError } = require('../utils/helpers');

const authenticate = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');
    req.user = verifyToken(token);
    next();
  } catch (e) {
    next(new ApiError(401, e.message || 'Invalid token'));
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return next(new ApiError(403, 'Access denied'));
  next();
};

const authorizeRoot = (req, res, next) => {
  if (req.user?.role !== 'root') return next(new ApiError(403, 'Root access only'));
  next();
};

// ── error.js ──────────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  if (status >= 500) console.error(err);
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate value for ${field}` });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(', ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID' });
  return res.status(status).json({ success: false, message: process.env.NODE_ENV === 'production' && status >= 500 ? 'Server error' : message });
};

// ── validate.js ───────────────────────────────────────────────────────────────
const Joi = require('joi');
const validate = schema => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });
  req.body = value;
  next();
};

module.exports = { authenticate, authorize, authorizeRoot, errorHandler, validate };
