const jwt = require('jsonwebtoken');

const { resp } = require('./misc');
const Admin = require('../models/Admin');

exports.jwtAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return resp(res, 401, 'Missing Authorization Header');

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') {
    return resp(res, 401, 'Invalid Authorization Scheme');
  }
  if (!token) return resp(res, 401, 'Malformed Authorization Header');

  try {
    req.token = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return resp(res, 401, 'Invalid or Expired JWT');
  }
};

exports.keyAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return resp(res, 401, 'missing authorization header');

  const [scheme, key] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'apikey') {
    return resp(res, 401, 'invalid authorization scheme');
  }
  if (!key) return resp(res, 401, 'malformed authorization header');

  if (key !== process.env.SERVICE_KEY) {
    return resp(res, 403, 'invalid service key');
  }

  return next();
};

exports.isAdmin = async (arg, res, next) => {
  const isMiddleware = typeof next === 'function';
  const uid = isMiddleware ? arg?.token?.uid : arg;

  try {
    if (!uid) {
      if (isMiddleware) return res.status(401).json({ error: 'No uid provided' });
      return false;
    }

    const exists = await Admin.exists({ user: uid });

    if (isMiddleware) {
      return exists ? next() : res.status(403).json({ error: 'Admin access required' });
    }
    return Boolean(exists);
  } catch (err) {
    if (isMiddleware) return res.status(401).json({ error: 'Invalid uid' });
    return false;
  }
};