const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Shop;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Shop = require('../../src/models/Shop');
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

function validShopBody(overrides = {}) {
  return {
    name: 'Corner Print Shop',
    address: '123 Main Street',
    coordinates: [33.6844, 73.0479],
    contactNumber: '03001234567',
    timings: Array(7).fill('09:00-18:00'),
    ...overrides,
  };
}

// -------------------------------------------------------------------------- //

describe('POST /api/shops', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .post('/api/shops')
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send(validShopBody({ imageFile: 'x' }));
    expect(res.status).toBe(403);
  });

  test('400s when a required field is missing', async () => {
    const { token } = await asAdmin();
    const res = await request(app).post('/api/shops').set('Authorization', token).send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  test('400s when imageFile does not exist', async () => {
    const { token } = await asAdmin();
    const res = await request(app)
      .post('/api/shops')
      .set('Authorization', token)
      .send(validShopBody({ imageFile: '00000000-0000-4000-8000-000000000000' }));
    expect(res.status).toBe(400);
  });

  test('creates a shop as an admin', async () => {
    const { token } = await asAdmin();
    const image = await factories.createFile({ type: 'raw', numberOfPages: undefined });

    const res = await request(app)
      .post('/api/shops')
      .set('Authorization', token)
      .send(validShopBody({ imageFile: image._id }));

    expect(res.status).toBe(201);
    expect(res.body.data.shop.name).toBe('Corner Print Shop');
  });
});

describe('GET /api/shops', () => {
  test('hides disabled shops from a non-admin', async () => {
    const user = await factories.createUser();
    await factories.createShop({ isDisabled: true });
    await factories.createShop({ isDisabled: false });

    const res = await request(app).get('/api/shops').set('Authorization', factories.bearer({ uid: String(user._id) }));

    expect(res.status).toBe(200);
    expect(res.body.data.shops).toHaveLength(1);
    expect(res.body.data.shops[0].isDisabled).toBe(false);
  });

  test('shows disabled shops to an admin', async () => {
    const { token } = await asAdmin();
    await factories.createShop({ isDisabled: true });
    await factories.createShop({ isDisabled: false });

    const res = await request(app).get('/api/shops').set('Authorization', token);
    expect(res.body.data.shops).toHaveLength(2);
  });
});

describe('GET /api/shops/:shopId', () => {
  test('404s for a missing shop', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .get('/api/shops/507f1f77bcf86cd799439011')
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(404);
  });

  test('200s and fetches a single shop', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .get(`/api/shops/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));

    expect(res.status).toBe(200);
    expect(res.body.data.shop._id).toBe(String(shop._id));
  });
});

describe('PUT /api/shops/:shopId', () => {
  test('403s for someone who is neither an admin nor the shop itself', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .put(`/api/shops/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ contactNumber: '03009999999' });
    expect(res.status).toBe(403);
  });

  test('lets the shop update its own contact fields but not its name', async () => {
    const shop = await factories.createShop();
    const token = factories.bearer({ uid: String((await factories.createUser())._id), sid: String(shop._id) });

    const res = await request(app)
      .put(`/api/shops/${shop._id}`)
      .set('Authorization', token)
      .send({ contactNumber: '03009999999', name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.data.shop.contactNumber).toBe('03009999999');
    expect(res.body.data.shop.name).toBe(shop.name);
  });

  test('lets an admin update the name and imageFile', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    const image = await factories.createFile({ type: 'raw', numberOfPages: undefined });

    const res = await request(app)
      .put(`/api/shops/${shop._id}`)
      .set('Authorization', token)
      .send({ name: 'Renamed Shop', imageFile: image._id });

    expect(res.status).toBe(200);
    expect(res.body.data.shop.name).toBe('Renamed Shop');
  });

  test('400s when the admin sets a non-existent imageFile', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app)
      .put(`/api/shops/${shop._id}`)
      .set('Authorization', token)
      .send({ imageFile: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(400);
  });

  test('404s for a missing shop', async () => {
    const { token } = await asAdmin();
    const res = await request(app)
      .put('/api/shops/507f1f77bcf86cd799439011')
      .set('Authorization', token)
      .send({ name: 'Ghost Shop' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/shops/:shopId/isDisabled', () => {
  test('403s for a non-admin', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .patch(`/api/shops/${shop._id}/isDisabled`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ isDisabled: true });
    expect(res.status).toBe(403);
  });

  test('400s when isDisabled is not boolean', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app)
      .patch(`/api/shops/${shop._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: 'nope' });
    expect(res.status).toBe(400);
  });

  test('toggles isDisabled as an admin', async () => {
    const shop = await factories.createShop({ isDisabled: false });
    const { token } = await asAdmin();

    const res = await request(app)
      .patch(`/api/shops/${shop._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: true });

    expect(res.status).toBe(200);
    expect((await Shop.findById(shop._id)).isDisabled).toBe(true);
  });
});

describe('DELETE /api/shops/:shopId', () => {
  test('501s (not implemented) for an admin', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app).delete(`/api/shops/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(501);
  });

  test('403s for a non-admin', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .delete(`/api/shops/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/shops/:shopId/status', () => {
  test('403s without a matching shop-scoped token', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .patch(`/api/shops/${shop._id}/status`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('updates lastSeen for the shop itself', async () => {
    const shop = await factories.createShop();
    const token = factories.bearer({ uid: String((await factories.createUser())._id), sid: String(shop._id) });

    const res = await request(app).patch(`/api/shops/${shop._id}/status`).set('Authorization', token);

    expect(res.status).toBe(200);
    const updated = await Shop.findById(shop._id);
    expect(updated.lastSeen.getTime()).toBeGreaterThan(0);
  });
});
