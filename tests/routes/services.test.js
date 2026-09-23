const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Service;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Service = require('../../src/models/Service');
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

function validServiceBody(printerId, overrides = {}) {
  return {
    rate: 5,
    keys: { color: false, pageType: 'A4', sidedness: false },
    printers: [{ useAuto: true, printer: String(printerId) }],
    ...overrides,
  };
}

// -------------------------------------------------------------------------- //

describe('GET /api/services', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/services').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createService();

    const res = await request(app).get('/api/services').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.services).toHaveLength(1);
  });
});

describe('GET /api/services/:shopId and /:shopId/:serviceId', () => {
  // test('403s for a stranger', async () => {
  //   const shop = await factories.createShop();
  //   const user = await factories.createUser();

  //   const res = await request(app)
  //     .get(`/api/services/${shop._id}`)
  //     .set('Authorization', factories.bearer({ uid: String(user._id) }));
  //   expect(res.status).toBe(403);
  // });

  test('200s and lists services for the shop owner', async () => {
    const shop = await factories.createShop();
    const service = await factories.createService({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app).get(`/api/services/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.services).toHaveLength(1);

    const single = await request(app).get(`/api/services/${shop._id}/${service._id}`).set('Authorization', token);
    expect(single.status).toBe(200);
    expect(single.body.data.service._id).toBe(String(service._id));
  });

  test('404s for a service belonging to a different shop', async () => {
    const shop = await factories.createShop();
    const otherShopService = await factories.createService();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .get(`/api/services/${shop._id}/${otherShopService._id}`)
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/services/:shopId', () => {
  test('403s for a stranger', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const user = await factories.createUser();

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send(validServiceBody(printer._id));
    expect(res.status).toBe(403);
  });

  test('400s when rate is missing or invalid', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id, { rate: -5 }));
    expect(res.status).toBe(400);
  });

  test('400s when keys are missing', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id, { keys: undefined }));
    expect(res.status).toBe(400);
  });

  test('400s when printers is empty', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody('x', { printers: [] }));
    expect(res.status).toBe(400);
  });

  test('400s when a printer does not belong to the shop', async () => {
    const shop = await factories.createShop();
    const foreignPrinter = await factories.createPrinter();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody(foreignPrinter._id));
    expect(res.status).toBe(400);
  });

  test('creates a service with a derived name', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id));

    expect(res.status).toBe(201);
    expect(res.body.data.service.name).toBe('A4-BW-SS');
  });

  test('409s on duplicate keys within the same shop', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    await factories.createService({ shop: shop._id, keys: { pageType: 'A4', color: false, sidedness: false } });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .post(`/api/services/${shop._id}`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id));
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/services/:shopId/:serviceId', () => {
  test('replaces a service as the shop owner', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const service = await factories.createService({ shop: shop._id, keys: { pageType: 'A4', color: false, sidedness: false } });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .put(`/api/services/${shop._id}/${service._id}`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id, { rate: 8, keys: { color: true, pageType: 'A3', sidedness: true } }));

    expect(res.status).toBe(200);
    expect(res.body.data.service.name).toBe('A3-CL-DS');
    expect(res.body.data.service.rate).toBe(8);
  });

  test('404s for a missing service', async () => {
    const shop = await factories.createShop();
    const printer = await factories.createPrinter({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .put(`/api/services/${shop._id}/507f1f77bcf86cd799439011`)
      .set('Authorization', token)
      .send(validServiceBody(printer._id));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/services/:shopId/:serviceId/isDisabled', () => {
  test('400s when isDisabled is not boolean', async () => {
    const shop = await factories.createShop();
    const service = await factories.createService({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .patch(`/api/services/${shop._id}/${service._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: 'nope' });
    expect(res.status).toBe(400);
  });

  test('toggles isDisabled', async () => {
    const shop = await factories.createShop();
    const service = await factories.createService({ shop: shop._id, isDisabled: false });
    const { token } = await asOwner(shop);

    const res = await request(app)
      .patch(`/api/services/${shop._id}/${service._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: true });

    expect(res.status).toBe(200);
    expect((await Service.findById(service._id)).isDisabled).toBe(true);
  });
});

describe('DELETE /api/services/:shopId/:serviceId', () => {
  test('deletes a service as the shop owner', async () => {
    const shop = await factories.createShop();
    const service = await factories.createService({ shop: shop._id });
    const { token } = await asOwner(shop);

    const res = await request(app).delete(`/api/services/${shop._id}/${service._id}`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(await Service.exists({ _id: service._id })).toBeFalsy();
  });

  test('404s for a missing service', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app)
      .delete(`/api/services/${shop._id}/507f1f77bcf86cd799439011`)
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });
});
