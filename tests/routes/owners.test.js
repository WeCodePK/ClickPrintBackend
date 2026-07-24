const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Owner;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Owner = require('../../src/models/Owner');
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

describe('GET /api/owners', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/owners').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s and lists all owners for an admin', async () => {
    const { token } = await asAdmin();
    const shop = await factories.createShop();
    await factories.createOwner({ shop: shop._id });

    const res = await request(app).get('/api/owners').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.owners).toHaveLength(1);
  });
});

describe('GET /api/owners/:shopId', () => {
  test('403s for someone who neither owns nor administers the shop', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();

    const res = await request(app)
      .get(`/api/owners/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s for the shop owner', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);

    const res = await request(app).get(`/api/owners/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.owners).toHaveLength(1);
  });

  test('200s for an admin', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app).get(`/api/owners/${shop._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/owners/:shopId', () => {
  test('403s for a non-admin, non-owner', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();
    const target = await factories.createUser();

    const res = await request(app)
      .post(`/api/owners/${shop._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ user: String(target._id) });
    expect(res.status).toBe(403);
  });

  test('400s when user field is missing', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app).post(`/api/owners/${shop._id}`).set('Authorization', token).send({});
    expect(res.status).toBe(400);
  });

  test('404s when the shop does not exist', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app)
      .post('/api/owners/507f1f77bcf86cd799439011')
      .set('Authorization', token)
      .send({ user: String(target._id) });
    expect(res.status).toBe(404);
  });

  test('404s when the target user does not exist', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();

    const res = await request(app)
      .post(`/api/owners/${shop._id}`)
      .set('Authorization', token)
      .send({ user: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(404);
  });

  test('appoints an owner as an admin, marking appointedByAdmin true', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app)
      .post(`/api/owners/${shop._id}`)
      .set('Authorization', token)
      .send({ user: String(target._id) });

    expect(res.status).toBe(201);
    expect(res.body.data.owner.appointedByAdmin).toBe(true);
  });

  test('lets an existing owner appoint another owner, marking appointedByAdmin false', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    const target = await factories.createUser();

    const res = await request(app)
      .post(`/api/owners/${shop._id}`)
      .set('Authorization', token)
      .send({ user: String(target._id) });

    expect(res.status).toBe(201);
    expect(res.body.data.owner.appointedByAdmin).toBe(false);
  });

  test('409s when the user is already an owner of the shop', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    const target = await factories.createUser();
    await factories.createOwner({ shop: shop._id, user: target._id });

    const res = await request(app)
      .post(`/api/owners/${shop._id}`)
      .set('Authorization', token)
      .send({ user: String(target._id) });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/owners/:shopId/:userId', () => {
  test('403s for a non-admin, non-owner', async () => {
    const shop = await factories.createShop();
    const owner = await factories.createOwner({ shop: shop._id });
    const stranger = await factories.createUser();

    const res = await request(app)
      .delete(`/api/owners/${shop._id}/${owner.user}`)
      .set('Authorization', factories.bearer({ uid: String(stranger._id) }));
    expect(res.status).toBe(403);
  });

  test('400s when an owner tries to remove themselves', async () => {
    const shop = await factories.createShop();
    const { user, token } = await asOwner(shop);

    const res = await request(app).delete(`/api/owners/${shop._id}/${user._id}`).set('Authorization', token);
    expect(res.status).toBe(400);
  });

  test('403s when a non-admin owner tries to remove an owner appointed by an admin', async () => {
    const shop = await factories.createShop();
    const { token } = await asOwner(shop);
    const target = await factories.createUser();
    await factories.createOwner({ shop: shop._id, user: target._id, appointedByAdmin: true });

    const res = await request(app).delete(`/api/owners/${shop._id}/${target._id}`).set('Authorization', token);
    expect(res.status).toBe(403);
  });

  test('404s when the owner record does not exist', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app).delete(`/api/owners/${shop._id}/${target._id}`).set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('lets an admin remove any owner, including an admin-appointed one', async () => {
    const shop = await factories.createShop();
    const { token } = await asAdmin();
    const target = await factories.createUser();
    await factories.createOwner({ shop: shop._id, user: target._id, appointedByAdmin: true });

    const res = await request(app).delete(`/api/owners/${shop._id}/${target._id}`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(await Owner.exists({ shop: shop._id, user: target._id })).toBeFalsy();
  });
});
