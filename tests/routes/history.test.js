const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
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

// -------------------------------------------------------------------------- //

describe('GET /api/history', () => {
  test('401s without a token', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(401);
  });

  test('scopes to the caller’s own history when not an admin', async () => {
    const user = await factories.createUser();
    await factories.createHistory({ createdBy: user._id });
    await factories.createHistory();

    const res = await request(app).get('/api/history').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
  });

  test('returns every entry for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createHistory();
    await factories.createHistory();

    const res = await request(app).get('/api/history').set('Authorization', token);
    expect(res.body.data.history).toHaveLength(2);
  });
});

describe('GET /api/history/shops/:shopId', () => {
  test('403s for someone who neither owns nor administers the shop', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .get(`/api/history/shops/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s and scopes to the shop for its owner', async () => {
    const shop = await factories.createShop();
    const owner = await factories.createUser();
    await factories.createOwner({ user: owner._id, shop: shop._id });
    await factories.createHistory({ shop: shop._id });
    await factories.createHistory();

    const res = await request(app)
      .get(`/api/history/shops/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(owner._id) }));

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
  });

  test('200s for an admin regardless of ownership', async () => {
    const shop = await factories.createShop();
    await factories.createHistory({ shop: shop._id });
    const { token } = await asAdmin();

    const res = await request(app).get(`/api/history/shops/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
  });
});
