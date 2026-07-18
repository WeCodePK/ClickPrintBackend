const jwt = require('jsonwebtoken');

const { resp } = require('./misc');
const Admin = require('../models/Admin');
const Owner = require('../models/Owner');

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
      if (isMiddleware) return resp(res, 401, 'no uid provided');
      return false;
    }

    const exists = await Admin.exists({ user: uid });

    if (isMiddleware) {
      return exists ? next() : resp(res, 403, 'you are not an admin');
    }
    return Boolean(exists);
  } catch (err) {
    if (isMiddleware) return resp(res, 401, 'invalid uid provided');
    return false;
  }
};

// ownsShops — function/middleware hybrid mirroring isAdmin.
//
//   ownsShops(uid)        -> Promise<{id, name}[]>  shops owned by uid
//   ownsShops(uid, sid)   -> Promise<boolean>   whether uid owns shop sid
//   ownsShops(req, res, next) as middleware:
//        uid  = req.token.uid  (always present after jwtAuth)
//        sid  = req.params.shopId (if present -> ownership check, else deny)
exports.ownsShops = async (arg, res, next) => {
  const isMiddleware = typeof next === 'function';
  const uid = isMiddleware ? arg?.token?.uid : arg;
  const sid = isMiddleware ? arg?.params?.shopId : res;

  try {
    if (!uid) {
      if (isMiddleware) return res.status(401).json({ error: 'No uid provided' });
      return sid ? false : [];
    }

    // Ownership check: a single shop is being asked about.
    if (sid) {
      const owns = await Owner.exists({ user: uid, shop: sid });
      if (isMiddleware) {
        return owns ? next() : res.status(403).json({ error: 'You do not own this shop' });
      }
      return Boolean(owns);
    }

    // Middleware with no shopId to check against -> deny.
    if (isMiddleware) {
      return res.status(403).json({ error: 'No shop specified' });
    }

    // Standalone list: every shop owned by this user.
    const owners = await Owner.find({ user: uid }).select('shop').populate('shop', 'name').lean();
    return owners
      .filter((o) => o.shop)
      .map((o) => ({ _id: String(o.shop._id), name: o.shop.name }));
  } catch (err) {
    if (isMiddleware) return res.status(401).json({ error: 'Invalid uid or shop' });
    return sid ? false : [];
  }
};