const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Topup;
let User;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Topup = require('../../src/models/Topup');
  User = require('../../src/models/User');
  factories = require('../helpers/factories');
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function asAdmin() {
  const { user } = await factories.createAdmin();
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

async function authedUser() {
  const user = await factories.createUser();
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

// -------------------------------------------------------------------------- //

describe('POST /api/topups', () => {
  test('400s when amount is not a valid multiple of 10', async () => {
    const { user, token } = await authedUser();
    const proof = await factories.createFile({ type: 'raw', numberOfPages: undefined, uploadedBy: user._id });

    const res = await request(app)
      .post('/api/topups')
      .set('Authorization', token)
      .send({ amount: 15, paymentProofFile: proof._id });
    expect(res.status).toBe(400);
  });

  test('400s when paymentProofFile is missing', async () => {
    const { token } = await authedUser();
    const res = await request(app).post('/api/topups').set('Authorization', token).send({ amount: 100 });
    expect(res.status).toBe(400);
  });

  test('400s when paymentProofFile does not exist', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/topups')
      .set('Authorization', token)
      .send({ amount: 100, paymentProofFile: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(400);
  });

  test('creates a pending topup', async () => {
    const { user, token } = await authedUser();
    const proof = await factories.createFile({ type: 'raw', numberOfPages: undefined, uploadedBy: user._id });

    const res = await request(app)
      .post('/api/topups')
      .set('Authorization', token)
      .send({ amount: 100, paymentProofFile: proof._id });

    expect(res.status).toBe(201);
    expect(res.body.data.topup.status).toBe('pending');
    expect(res.body.data.topup.amount).toBe(100);
  });
});

describe('GET /api/topups', () => {
  test('scopes to the caller’s own topups when not an admin', async () => {
    const { user, token } = await authedUser();
    await factories.createTopup({ createdBy: user._id });
    await factories.createTopup();

    const res = await request(app).get('/api/topups').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.topups).toHaveLength(1);
  });

  test('lists every topup for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createTopup();
    await factories.createTopup();

    const res = await request(app).get('/api/topups').set('Authorization', token);
    expect(res.body.data.topups).toHaveLength(2);
  });
});

describe('GET /api/topups/:topupId', () => {
  test('404s when fetching another user’s topup', async () => {
    const { token } = await authedUser();
    const topup = await factories.createTopup();

    const res = await request(app).get(`/api/topups/${topup._id}`).set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('200s for the owner', async () => {
    const { user, token } = await authedUser();
    const topup = await factories.createTopup({ createdBy: user._id });

    const res = await request(app).get(`/api/topups/${topup._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/topups/:topupId', () => {
  test('403s for a non-admin', async () => {
    const { token } = await authedUser();
    const topup = await factories.createTopup();

    const res = await request(app).patch(`/api/topups/${topup._id}`).set('Authorization', token).send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  test('400s for an invalid status', async () => {
    const { token } = await asAdmin();
    const topup = await factories.createTopup();

    const res = await request(app).patch(`/api/topups/${topup._id}`).set('Authorization', token).send({ status: 'refunded' });
    expect(res.status).toBe(400);
  });

  test('404s for a missing topup', async () => {
    const { token } = await asAdmin();
    const res = await request(app)
      .patch('/api/topups/507f1f77bcf86cd799439011')
      .set('Authorization', token)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });

  test('409s when the topup was already resolved', async () => {
    const { token } = await asAdmin();
    const topup = await factories.createTopup({ status: 'declined' });

    const res = await request(app).patch(`/api/topups/${topup._id}`).set('Authorization', token).send({ status: 'approved' });
    expect(res.status).toBe(409);
  });

  test('approving credits the user’s balance', async () => {
    const { token } = await asAdmin();
    const owner = await factories.createUser({ balance: 20 });
    const topup = await factories.createTopup({ createdBy: owner._id, amount: 50 });

    const res = await request(app).patch(`/api/topups/${topup._id}`).set('Authorization', token).send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect((await User.findById(owner._id)).balance).toBe(70);
    expect((await Topup.findById(topup._id)).status).toBe('approved');
  });

  test('declining does not change the balance', async () => {
    const { token } = await asAdmin();
    const owner = await factories.createUser({ balance: 20 });
    const topup = await factories.createTopup({ createdBy: owner._id, amount: 50 });

    const res = await request(app).patch(`/api/topups/${topup._id}`).set('Authorization', token).send({ status: 'declined' });

    expect(res.status).toBe(200);
    expect((await User.findById(owner._id)).balance).toBe(20);
  });
});
