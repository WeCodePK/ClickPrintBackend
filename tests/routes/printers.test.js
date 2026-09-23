const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Printer;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Printer = require('../../src/models/Printer');
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

async function asOwner(shop) {
  const user = await factories.createUser();
  await factories.createOwner({ user: user._id, shop: shop._id });
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

// -------------------------------------------------------------------------- //

describe('GET /api/printers', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/printers').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createPrinter();

    const res = await request(app).get('/api/printers').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.printers).toHaveLength(1);
  });
});

describe('GET /api/printers/:shopId', () => {
  test('403s for a stranger', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .get(`/api/printers/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s and lists printers for the shop owner', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    await factories.createPrinter({ shop: shop._id });

    const res = await request(app).get(`/api/printers/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.printers).toHaveLength(1);
  });
});

describe('GET /api/printers/:shopId/:printerId', () => {
  test('404s for a missing printer', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .get(`/api/printers/${shop._id}/507f1f77bcf86cd799439011`)
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('200s for a matching printer', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    const printer = await factories.createPrinter({ shop: shop._id });

    const res = await request(app).get(`/api/printers/${shop._id}/${printer._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.printer._id).toBe(String(printer._id));
  });
});

describe('POST /api/printers/:shopId', () => {
  test('403s for a stranger', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .post(`/api/printers/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ name: 'HP LaserJet' });
    expect(res.status).toBe(403);
  });

  test('400s when name is missing', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app).post(`/api/printers/${shop._id}`).set('Authorization', token).send({});
    expect(res.status).toBe(400);
  });

  test('404s when the shop does not exist', async () => {
    const { token } = await asAdmin();

    const res = await request(app)
      .post('/api/printers/507f1f77bcf86cd799439011')
      .set('Authorization', token)
      .send({ name: 'HP LaserJet' });
    expect(res.status).toBe(404);
  });

  test('creates a printer as the shop owner', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app).post(`/api/printers/${shop._id}`).set('Authorization', token).send({ name: 'HP LaserJet' });

    expect(res.status).toBe(201);
    expect(res.body.data.printer.name).toBe('HP LaserJet');
  });

  test('409s on a duplicate printer name within the shop', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    await factories.createPrinter({ shop: shop._id, name: 'HP LaserJet' });

    const res = await request(app).post(`/api/printers/${shop._id}`).set('Authorization', token).send({ name: 'HP LaserJet' });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/printers/:shopId/:printerId', () => {
  test('403s for a non-admin (owner cannot rename)', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    const printer = await factories.createPrinter({ shop: shop._id });

    const res = await request(app)
      .put(`/api/printers/${shop._id}/${printer._id}`)
      .set('Authorization', token)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(403);
  });

  test('400s when name is missing', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asAdmin();

    const res = await request(app).put(`/api/printers/${shop._id}/${printer._id}`).set('Authorization', token).send({});
    expect(res.status).toBe(400);
  });

  test('renames a printer as an admin', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asAdmin();

    const res = await request(app)
      .put(`/api/printers/${shop._id}/${printer._id}`)
      .set('Authorization', token)
      .send({ name: 'Renamed Printer' });

    expect(res.status).toBe(200);
    expect(res.body.data.printer.name).toBe('Renamed Printer');
  });

  test('404s for a missing printer', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app)
      .put(`/api/printers/${shop._id}/507f1f77bcf86cd799439011`)
      .set('Authorization', token)
      .send({ name: 'Renamed Printer' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/printers/:shopId/:printerId/isDisabled', () => {
  test('400s when isDisabled is not boolean', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .patch(`/api/printers/${shop._id}/${printer._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: 'nope' });
    expect(res.status).toBe(400);
  });

  test('toggles isDisabled as the shop owner', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id, isDisabled: false });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .patch(`/api/printers/${shop._id}/${printer._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: true });

    expect(res.status).toBe(200);
    expect((await Printer.findById(printer._id)).isDisabled).toBe(true);
  });
});

describe('DELETE /api/printers/:shopId/:printerId', () => {
  test('403s for a stranger', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const user = await factories.createUser();

    const res = await request(app)
      .delete(`/api/printers/${shop._id}/${printer._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('deletes a printer as the shop owner', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app).delete(`/api/printers/${shop._id}/${printer._id}`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(await Printer.exists({ _id: printer._id })).toBeFalsy();
  });

  test('404s for a missing printer', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .delete(`/api/printers/${shop._id}/507f1f77bcf86cd799439011`)
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });
});
