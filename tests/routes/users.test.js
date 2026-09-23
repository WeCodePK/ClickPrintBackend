const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let User;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
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
  const { admin, user } = await factories.createAdmin();
  return { admin, token: factories.bearer({ uid: String(user._id) }) };
}

// -------------------------------------------------------------------------- //

describe('GET /api/users', () => {
  test('401s without a token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('401s with a garbage token', async () => {
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  test('403s for a non-admin listing all users', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/users').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('200s and lists all users for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createUser();
    await factories.createUser();

    const res = await request(app).get('/api/users').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/users/:userId', () => {
  test('403s when a non-admin views another user', async () => {
    const self = await factories.createUser();
    const other = await factories.createUser();

    const res = await request(app)
      .get(`/api/users/${other._id}`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }));

    expect(res.status).toBe(403);
  });

  test('200s when a user views themselves', async () => {
    const self = await factories.createUser();

    const res = await request(app)
      .get(`/api/users/${self._id}`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }));

    expect(res.status).toBe(200);
    expect(res.body.data.user._id).toBe(String(self._id));
  });

  test('404s for a missing user', async () => {
    const { token } = await asAdmin();
    const res = await request(app).get('/api/users/507f1f77bcf86cd799439011').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('400s for an invalid object id', async () => {
    const { token } = await asAdmin();
    const res = await request(app).get('/api/users/not-an-id').set('Authorization', token);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/users', () => {
  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', factories.bearer({ uid: String(user._id) }))
      .send({ number: factories.phoneNumber() });
    expect(res.status).toBe(403);
  });

  test('400s when number is missing', async () => {
    const { token } = await asAdmin();
    const res = await request(app).post('/api/users').set('Authorization', token).send({ name: 'No Number' });
    expect(res.status).toBe(400);
  });

  test('creates a user as an admin', async () => {
    const { token } = await asAdmin();
    const number = factories.phoneNumber();

    const res = await request(app).post('/api/users').set('Authorization', token).send({ name: 'Created', number });

    expect(res.status).toBe(201);
    expect(res.body.data.user.number).toBe(number);
  });
});

describe('PUT /api/users/:userId', () => {
  test('403s when a non-admin updates another user', async () => {
    const self = await factories.createUser();
    const other = await factories.createUser();

    const res = await request(app)
      .put(`/api/users/${other._id}`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }))
      .send({ name: 'Hacker' });

    expect(res.status).toBe(403);
  });

  test('lets a user update their own name but not their number', async () => {
    const self = await factories.createUser();
    const otherNumber = factories.phoneNumber();

    const res = await request(app)
      .put(`/api/users/${self._id}`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }))
      .send({ name: 'New Name', number: otherNumber });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('New Name');
    expect(res.body.data.user.number).toBe(self.number);
  });

  test('lets an admin update a number, 400s on invalid format', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', token)
      .send({ number: 'bad-number' });

    expect(res.status).toBe(400);
  });

  test('409s when updating to a number already in use', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();
    const taken = await factories.createUser();

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', token)
      .send({ number: taken.number });

    expect(res.status).toBe(409);
  });

  test('404s for a missing user', async () => {
    const { token } = await asAdmin();
    const res = await request(app)
      .put('/api/users/000000000000000000000000')
      .set('Authorization', token)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/:userId/isDisabled', () => {
  test('403s for a non-admin', async () => {
    const self = await factories.createUser();
    const res = await request(app)
      .patch(`/api/users/${self._id}/isDisabled`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }))
      .send({ isDisabled: true });
    expect(res.status).toBe(403);
  });

  test('400s when isDisabled is not boolean', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();
    const res = await request(app)
      .patch(`/api/users/${target._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: 'yes' });
    expect(res.status).toBe(400);
  });

  test('disables a user as an admin', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app)
      .patch(`/api/users/${target._id}/isDisabled`)
      .set('Authorization', token)
      .send({ isDisabled: true });

    expect(res.status).toBe(200);
    expect(res.body.data.user.isDisabled).toBe(true);
    expect((await User.findById(target._id)).isDisabled).toBe(true);
  });
});

describe('DELETE /api/users/:userId', () => {
  test('403s for a non-admin', async () => {
    const self = await factories.createUser();
    const res = await request(app)
      .delete(`/api/users/${self._id}`)
      .set('Authorization', factories.bearer({ uid: String(self._id) }));
    expect(res.status).toBe(403);
  });

  test('501s (not implemented) for an admin', async () => {
    const { token } = await asAdmin();
    const target = await factories.createUser();

    const res = await request(app).delete(`/api/users/${target._id}`).set('Authorization', token);
    expect(res.status).toBe(501);
  });
});
