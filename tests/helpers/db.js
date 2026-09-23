const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

async function connectTestDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { dbName: 'test' });
}

async function clearTestDb() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function closeTestDb() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

module.exports = { connectTestDb, clearTestDb, closeTestDb };
