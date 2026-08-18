const mongoose = require('mongoose');

const app = require('./app');

// -------------------------------------------------------------------------- //

const required = [
  'JWT_SECRET',
  'SERVICE_KEY',
  'EXPO_ACCESS_TOKEN',
  'MONGODB_URI',
  'SMSGATE_URL',
  'WEBOTP_SMS_ORIGIN'
];

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
