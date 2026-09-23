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

const endpoints = ['drafts', 'jobs', 'history', 'shops', 'topups', 'users'];

// -------------------------------------------------------------------------- //

describe.each(endpoints)('GET /api/stats/%s', (endpoint) => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .get(`/api/stats/${endpoint}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s for an admin', async () => {
    const { token } = await asAdmin();
    const res = await request(app).get(`/api/stats/${endpoint}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toBeDefined();
  });
});

describe('GET /api/stats/drafts', () => {
  test('partitions drafts into ready, complete, and incomplete', async () => {
    const { token } = await asAdmin();

    await factories.createDraft({ cost: { lines: [], extra: [], total: 10 } }); // ready
    const shop = await factories.createShop();
    const file = await factories.createFile();
    await factories.createDraft({ shop: shop._id, files: [{ file: file._id, settings: factories.fileSettings() }] }); // complete
    await factories.createDraft(); // incomplete (no shop, no files)

    const res = await request(app).get('/api/stats/drafts').set('Authorization', token);

    expect(res.body.data.stats).toEqual({ drafts: 3, ready: 1, complete: 1, incomplete: 1 });
  });
});

describe('GET /api/stats/users', () => {
  test('counts admins', async () => {
    const { token } = await asAdmin();
    await factories.createUser();

    const res = await request(app).get('/api/stats/users').set('Authorization', token);

    expect(res.body.data.stats.admins).toBe(1);
  });

  // NB: the route computes owners via `Shop.distinct('owner')`, but ownership
  // lives on the Owner collection (`user`/`shop` fields) — Shop has no `owner`
  // field. This assertion documents the current (likely unintended) behavior
  // rather than the probably-intended "count actual shop owners" semantics.
  test('currently always reports zero owners, regardless of actual ownership', async () => {
    const { token } = await asAdmin();
    const shop = await factories.createShop();
    const owner = await factories.createUser();
    await factories.createOwner({ user: owner._id, shop: shop._id });

    const res = await request(app).get('/api/stats/users').set('Authorization', token);

    expect(res.body.data.stats.owners).toBe(0);
  });
});
