jest.mock('../../src/func/push', () => ({
  notifyUserOnJobStatus: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');
const { notifyUserOnJobStatus } = require('../../src/func/push');

let app;
let Job;
let History;
let User;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Job = require('../../src/models/Job');
  History = require('../../src/models/History');
  User = require('../../src/models/User');
  factories = require('../helpers/factories');
});

afterEach(async () => {
  await clearTestDb();
  notifyUserOnJobStatus.mockClear();
});

afterAll(async () => {
  await closeTestDb();
});

async function asAdmin() {
  const { user } = await factories.createAdmin();
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

function userToken(user) {
  return factories.bearer({ uid: String(user._id) });
}

// Creates a fresh user who owns the given shop, and returns their token.
async function shopOwnerToken(shopId) {
  const device = await factories.createUser();
  await factories.createOwner({ user: device._id, shop: shopId });
  return userToken(device);
}

// -------------------------------------------------------------------------- //

describe('GET /api/jobs', () => {
  test('401s without a token', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(401);
  });

  test('scopes the list to the caller’s own jobs', async () => {
    const user = await factories.createUser();
    await factories.createJob({ createdBy: user._id });
    await factories.createJob();

    const res = await request(app).get('/api/jobs').set('Authorization', userToken(user));
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
  });

  test('lists every job for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createJob();
    await factories.createJob();

    const res = await request(app).get('/api/jobs').set('Authorization', token);
    expect(res.body.data.jobs).toHaveLength(2);
  });
});

describe('GET /api/jobs/shops/:shopId', () => {
  test('403s for someone who does not own the shop', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app).get(`/api/jobs/shops/${shop._id}`).set('Authorization', userToken(user));
    expect(res.status).toBe(403);
  });

  test('scopes the list to the shop for its owner', async () => {
    const shop = await factories.createShop();
    await factories.createJob({ shop: shop._id });
    await factories.createJob();

    const res = await request(app).get(`/api/jobs/shops/${shop._id}`).set('Authorization', await shopOwnerToken(shop._id));
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
  });

  test('200s for an admin regardless of ownership', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    await factories.createJob({ shop: shop._id });

    const res = await request(app).get(`/api/jobs/shops/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
  });
});

describe('GET /api/jobs/:jobId', () => {
  test('404s when the job is outside the caller’s scope', async () => {
    const user = await factories.createUser();
    const job = await factories.createJob();

    const res = await request(app).get(`/api/jobs/${job._id}`).set('Authorization', userToken(user));
    expect(res.status).toBe(404);
  });

  test('200s for the job’s owner', async () => {
    const user = await factories.createUser();
    const job = await factories.createJob({ createdBy: user._id });

    const res = await request(app).get(`/api/jobs/${job._id}`).set('Authorization', userToken(user));
    expect(res.status).toBe(200);
    expect(res.body.data.job._id).toBe(String(job._id));
  });

  test('200s for the owner of the job’s shop', async () => {
    const shop = await factories.createShop();
    const job = await factories.createJob({ shop: shop._id });

    const res = await request(app).get(`/api/jobs/${job._id}`).set('Authorization', await shopOwnerToken(shop._id));
    expect(res.status).toBe(200);
    expect(res.body.data.job._id).toBe(String(job._id));
  });
});

describe('PATCH /api/jobs/:jobId/status', () => {
  test('400s when status is missing', async () => {
    const user = await factories.createUser();
    const job = await factories.createJob({ createdBy: user._id, status: 'submitted' });

    const res = await request(app).patch(`/api/jobs/${job._id}/status`).set('Authorization', userToken(user)).send({});
    expect(res.status).toBe(400);
  });

  test('404s for a missing job', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .patch('/api/jobs/507f1f77bcf86cd799439011/status')
      .set('Authorization', userToken(user))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(404);
  });

  test('403s when a user targets a job they do not own', async () => {
    const user = await factories.createUser();
    const job = await factories.createJob({ status: 'submitted' });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', userToken(user))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(403);
  });

  test('403s when a shop targets a job for a different shop', async () => {
    const otherShop = await factories.createShop();
    const job = await factories.createJob({ status: 'submitted' });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(otherShop._id))
      .send({ status: 'queued' });
    expect(res.status).toBe(403);
  });

  test('403s when the role is not allowed to perform the transition', async () => {
    const user = await factories.createUser();
    const job = await factories.createJob({ createdBy: user._id, status: 'submitted' });

    // Only a shop may move submitted -> queued.
    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', userToken(user))
      .send({ status: 'queued' });
    expect(res.status).toBe(403);
  });

  test('409s on an illegal transition', async () => {
    const shop = await factories.createShop();
    const job = await factories.createJob({ shop: shop._id, status: 'submitted' });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(shop._id))
      .send({ status: 'printing' }); // submitted can only go to queued/cancelled
    expect(res.status).toBe(409);
  });

  test('409s when the job is already in a terminal state', async () => {
    const shop = await factories.createShop();
    const job = await factories.createJob({ shop: shop._id, status: 'completed' });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(shop._id))
      .send({ status: 'printing' });
    expect(res.status).toBe(409);
  });

  test('advances submitted -> queued as the shop and notifies the user', async () => {
    const shop = await factories.createShop();
    const job = await factories.createJob({ shop: shop._id, status: 'submitted' });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(shop._id))
      .send({ status: 'queued' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('queued');
    expect(res.body.data.job.statusHistory).toHaveLength(2);
    expect(notifyUserOnJobStatus).toHaveBeenCalledTimes(1);
  });

  test('cancelling refunds the user and archives the job to history', async () => {
    const shop = await factories.createShop();
    const creator = await factories.createUser({ balance: 40 });
    const job = await factories.createJob({
      shop: shop._id,
      createdBy: creator._id,
      status: 'submitted',
      cost: { lines: [], extra: [], total: 60 },
    });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(shop._id))
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(await Job.exists({ _id: job._id })).toBeFalsy();
    expect(await History.exists({ _id: job._id })).toBeTruthy();

    const refunded = await User.findById(creator._id);
    expect(refunded.balance).toBe(100);
  });

  test('completing a printing job archives it without a refund', async () => {
    const shop = await factories.createShop();
    const creator = await factories.createUser({ balance: 40 });
    const job = await factories.createJob({
      shop: shop._id,
      createdBy: creator._id,
      status: 'printing',
      cost: { lines: [], extra: [], total: 60 },
    });

    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', await shopOwnerToken(shop._id))
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(await Job.exists({ _id: job._id })).toBeFalsy();
    expect(await History.exists({ _id: job._id })).toBeTruthy();

    const unchanged = await User.findById(creator._id);
    expect(unchanged.balance).toBe(40);
  });

  test('a shop owner who also created the job acts as the shop', async () => {
    const shop = await factories.createShop();
    const device = await factories.createUser();
    await factories.createOwner({ user: device._id, shop: shop._id });
    const job = await factories.createJob({ shop: shop._id, createdBy: device._id, status: 'submitted' });

    // submitted -> queued is shop-only; if the dual identity were treated as
    // 'user' this would 403.
    const res = await request(app)
      .patch(`/api/jobs/${job._id}/status`)
      .set('Authorization', userToken(device))
      .send({ status: 'queued' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.statusHistory.at(-1).by).toBe('shop');
  });
});
