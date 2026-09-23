const cors = require('cors');
const morgan = require('morgan');
const express = require('express');
const mongoose = require('mongoose');

const { resp } = require('./func/misc');
const { jwtAuth } = require('./func/auth');

// -------------------------------------------------------------------------- //

process.env.GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
process.env.GOTENBERG_WEBHOOK_URL = process.env.GOTENBERG_WEBHOOK_URL || 'http://backend';

// -------------------------------------------------------------------------- //

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// -------------------------------------------------------------------------- //

app.use(morgan('combined', {
  skip: (req, res) => req.path === '/health' || process.env.NODE_ENV === 'test'
}));

app.use(cors({
  origin: '*',
  maxAge: 7200,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// -------------------------------------------------------------------------- //

// TODO update
// Return 200 if MongoDB is reachable, 503 otherwise
app.get('/health', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.sendStatus(200);
  }
  catch (err) {
    console.error('[ERROR] Failed Health Check:', err);
    res.sendStatus(503);
  }
});

// -------------------------------------------------------------------------- //

app.use('/admins',    jwtAuth,  require('./routes/Admins.js'));
app.use('/auth',                require('./routes/Auth.js'));
app.use('/contact',             require('./routes/Contact.js'));
app.use('/drafts',    jwtAuth,  require('./routes/Drafts.js'));
app.use('/events',    jwtAuth,  require('./routes/Events.js'));
app.use('/files',               require('./routes/Files.js'));
app.use('/history',   jwtAuth,  require('./routes/History.js'));
app.use('/jobs',      jwtAuth,  require('./routes/Jobs.js'));
app.use('/owners',    jwtAuth,  require('./routes/Owners.js'));
app.use('/printers',  jwtAuth,  require('./routes/Printers.js'));
app.use('/services',  jwtAuth,  require('./routes/Services.js'));
app.use('/shops',     jwtAuth,  require('./routes/Shops.js'));
app.use('/stats',     jwtAuth,  require('./routes/Stats.js'));
app.use('/topups',    jwtAuth,  require('./routes/Topups.js'));
app.use('/users',     jwtAuth,  require('./routes/Users.js'));

// -------------------------------------------------------------------------- //

app.use((req, res) => resp(res, 404, 'Not found'));

// -------------------------------------------------------------------------- //

app.use((err, req, res, next) => {
  if (err.expose && err.statusCode >= 400 && err.statusCode < 500) {
    return resp(res, err.statusCode, err.message);
  }

  if (err.name === 'ValidationError') {
    const [firstError] = Object.values(err.errors);
    return resp(res, 400, firstError.message);
  }

  if (err.name === 'CastError') {
    return resp(res, 400, `Field '${err.path}' has an invalid value`);
  }

  if (err.code === 11000) {
    const [field, value] = Object.entries(err.keyValue || {})[0] || [];
    return resp(res, 409, `A record with '${field}' = '${value}' already exists`);
  }

  console.error('[ERROR]', err);
  resp(res, 500, 'Internal Server Error');
});

// -------------------------------------------------------------------------- //

module.exports = app;
