const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Admin;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Admin = require('../../src/models/Admin');
  factories = require('../helpers/factories');
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function asAdmin() {
  const { admin, user } = await factories.createAdmin();
  return { admin, user, token: factories.bearer({ uid: String(user._id) }) };
}

// -------------------------------------------------------------------------- //

describe('GET /api/admins', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/admins').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s and lists all admins populated', async () => {
    const { token, user } = await asAdmin();
    const res = await request(app).get('/api/admins').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.admins).toHaveLength(1);
    expect(res.body.data.admins[0]._id.number).toBe(user.number);
  });
});

describe('POST /api/admins', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const target = await factories.createUser();
    const res = await request(app)
      .post('/api/admins')
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ user: String(target._id) });
    expect(res.status).toBe(403);
  });

  test('400s when user field is missing', async () => {
    const { token } = await asAdmin();
    const res = await request(app).post('/api/admins').set('Authorization', token).send({});
    expect(res.status).toBe(400);
  });

  test('400s when user field is not a valid object id', async () => {
    const { token } = await asAdmin();
    const res = await request(app).post('/api/admins').set('Authorization', token).send({ user: 'nope' });
    expect(res.status).toBe(400);
  });

  test('404s when the target user does not exist', async () => {
    const { token } = await asAdmin();
    const res = await request(app)
      .post('/api/admins')
      .set('Authorization', token)
      .send({ user: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(404);
  });

  test('appoints a new admin', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app).post('/api/admins').set('Authorization', token).send({ user: String(target._id) });

    expect(res.status).toBe(201);
    expect(res.body.data.admin._id.number).toBe(target.number);
    expect(await Admin.exists({ _id: target._id })).toBeTruthy();
  });

  test('409s when the user is already an admin', async () => {
    const { token } = await asAdmin();
    const { user: target } = await factories.createAdmin();

    const res = await request(app).post('/api/admins').set('Authorization', token).send({ user: String(target._id) });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admins/:userId', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .delete(`/api/admins/${user._id}`)
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('400s when an admin tries to remove themselves', async () => {
    const { token, user } = await asAdmin();
    const res = await request(app).delete(`/api/admins/${user._id}`).set('Authorization', token);
    expect(res.status).toBe(400);
  });

  test('404s for a non-admin target', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();
    const res = await request(app).delete(`/api/admins/${target._id}`).set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('removes an admin', async () => {
    const { token } = await asAdmin();
    const { user: target } = await factories.createAdmin();

    const res = await request(app).delete(`/api/admins/${target._id}`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(await Admin.exists({ _id: target._id })).toBeFalsy();
  });
});
