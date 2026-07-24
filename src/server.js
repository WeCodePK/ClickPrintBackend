const cors = require('cors');
const morgan = require('morgan');
const express = require('express');
const mongoose = require('mongoose');

const { resp } = require('./func/misc');
const { jwtAuth } = require('./func/auth');

// -------------------------------------------------------------------------- //

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// -------------------------------------------------------------------------- //

app.use(morgan('combined', {
  skip: (req, res) => req.path === '/health'
}));

app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// -------------------------------------------------------------------------- //

const required = [
  'JWT_SECRET',
  'SERVICE_KEY',
  'EXPO_ACCESS_TOKEN',
  'MONGODB_URI',
  'SMSGATE_URL',
];

process.env.GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
process.env.GOTENBERG_WEBHOOK_URL = process.env.GOTENBERG_WEBHOOK_URL || 'http://backend:3000';

for (const v of required) {
  if (!process.env[v]) {
    console.error(`[ERROR] ${v} environment variable is required`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------------- //

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('[INFO] Successfully connected to MongoDB'))
.catch(err => {
  console.error('[ERROR] Failed to connect to MongoDB:', err);
  process.exit(1);
});

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

app.use('/api/admins',    jwtAuth,  require('./routes/Admins.js'));
app.use('/api/auth',                require('./routes/Auth.js'));
app.use('/api/drafts',    jwtAuth,  require('./routes/Drafts.js'));
app.use('/api/events',    jwtAuth,  require('./routes/Events.js'));
app.use('/api/files',               require('./routes/Files.js'));
app.use('/api/history',   jwtAuth,  require('./routes/History.js'));
app.use('/api/jobs',      jwtAuth,  require('./routes/Jobs.js'));
app.use('/api/owners',    jwtAuth,  require('./routes/Owners.js'));
app.use('/api/printers',  jwtAuth,  require('./routes/Printers.js'));
app.use('/api/services',  jwtAuth,  require('./routes/Services.js'));
app.use('/api/shops',     jwtAuth,  require('./routes/Shops.js'));
app.use('/api/stats',     jwtAuth,  require('./routes/Stats.js'));
app.use('/api/topups',    jwtAuth,  require('./routes/Topups.js'));
app.use('/api/users',     jwtAuth,  require('./routes/Users.js'));

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

const server = app.listen(process.env.PORT || 3000, () => {
  console.log('[INFO] Server listening on port', process.env.PORT || 3000);
});

// -------------------------------------------------------------------------- //

const gracefulShutdown = async (server) => {
  try {
    console.log('[INFO] Attempting to gracefully shut down server');

    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[INFO] Successfully shutdown server');

    await mongoose.connection.close();
    console.log('[INFO] Successfully closed MongoDB connection');

    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Error during server shutdown:', err);
    process.exit(1);
  }
};

// -------------------------------------------------------------------------- //

process.on('SIGINT', () => gracefulShutdown(server));
process.on('SIGTERM', () => gracefulShutdown(server));

process.on('unhandledRejection', (err) => {
  console.error('[ERROR] Unhandled rejection:', err);
  gracefulShutdown(server);
});