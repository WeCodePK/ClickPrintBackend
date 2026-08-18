jest.mock('../../src/func/misc', () => {
  const actual = jest.requireActual('../../src/func/misc');
  return { ...actual, sendViaSms: jest.fn().mockResolvedValue({ ok: true }) };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');
const { sendViaSms } = require('../../src/func/misc');

let app;
let Otp;
let User;
let Admin;
let Owner;
let Shop;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Otp = require('../../src/models/Otp');
  User = require('../../src/models/User');
  Admin = require('../../src/models/Admin');
  Owner = require('../../src/models/Owner');
  Shop = require('../../src/models/Shop');
  factories = require('../helpers/factories');
});

afterEach(async () => {
  await clearTestDb();
  sendViaSms.mockClear();
});

afterAll(async () => {
  await closeTestDb();
});

// -------------------------------------------------------------------------- //

describe('POST /api/auth/otp', () => {
  test('400s when number is missing', async () => {
    const res = await request(app).post('/api/auth/otp').send({ intent: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400s when number is not valid E164', async () => {
    const res = await request(app).post('/api/auth/otp').send({ number: '12345', intent: 'user' });
    expect(res.status).toBe(400);
  });

  test('400s when intent is missing', async () => {
    const res = await request(app).post('/api/auth/otp').send({ number: factories.phoneNumber() });
    expect(res.status).toBe(400);
  });

  test('400s when intent is invalid', async () => {
    const res = await request(app).post('/api/auth/otp').send({ number: factories.phoneNumber(), intent: 'root' });
    expect(res.status).toBe(400);
  });

  test('sends an otp for a user intent and returns config', async () => {
    const number = factories.phoneNumber();
    const res = await request(app).post('/api/auth/otp').send({ number, intent: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.data.config).toMatchObject({ codeLength: 5 });
    expect(sendViaSms).toHaveBeenCalledWith(number, expect.stringContaining('code'));

    const stored = await Otp.findOne({ number });
    expect(stored).not.toBeNull();
    expect(stored.tries).toBe(3);
  });

  test('429s when resending within the cooldown window', async () => {
    const number = factories.phoneNumber();
    await Otp.create({ code: '11111', number, tries: 3, lastSentAt: new Date(), expiry: new Date(Date.now() + 60000) });

    const res = await request(app).post('/api/auth/otp').send({ number, intent: 'user' });
    expect(res.status).toBe(429);
  });

  test('404s for shop intent when the user does not exist', async () => {
    const res = await request(app).post('/api/auth/otp').send({ number: factories.phoneNumber(), intent: 'shop' });
    expect(res.status).toBe(404);
  });

  test('403s for shop intent when the user owns no shops', async () => {
    const user = await factories.createUser();
    const res = await request(app).post('/api/auth/otp').send({ number: user.number, intent: 'shop' });
    expect(res.status).toBe(403);
  });

  test('200s for shop intent when the user owns a shop', async () => {
    const user = await factories.createUser();
    await factories.createOwner({ user: user._id });

    const res = await request(app).post('/api/auth/otp').send({ number: user.number, intent: 'shop' });
    expect(res.status).toBe(200);
  });

  test('403s for admin intent when the user is not an admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).post('/api/auth/otp').send({ number: user.number, intent: 'admin' });
    expect(res.status).toBe(403);
  });

  test('200s for admin intent when the user is an admin', async () => {
    const { user } = await factories.createAdmin();
    const res = await request(app).post('/api/auth/otp').send({ number: user.number, intent: 'admin' });
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------------------------- //

describe('POST /api/auth/verify', () => {
  test('400s when code or number is missing', async () => {
    const res = await request(app).post('/api/auth/verify').send({ number: factories.phoneNumber() });
    expect(res.status).toBe(400);
  });

  test('401s when no otp exists for the number', async () => {
    const res = await request(app).post('/api/auth/verify').send({ number: factories.phoneNumber(), code: '12345' });
    expect(res.status).toBe(401);
  });

  test('401s and deletes an expired otp', async () => {
    const otp = await factories.createOtp({ expiry: new Date(Date.now() - 1000) });

    const res = await request(app).post('/api/auth/verify').send({ number: otp.number, code: otp.code });
    expect(res.status).toBe(401);
    expect(await Otp.findById(otp._id)).toBeNull();
  });

  test('429s once tries are exhausted', async () => {
    const otp = await factories.createOtp({ tries: 0 });

    const res = await request(app).post('/api/auth/verify').send({ number: otp.number, code: otp.code });
    expect(res.status).toBe(429);
  });

  test('401s and decrements tries on a wrong code', async () => {
    const otp = await factories.createOtp({ code: '99999', tries: 3 });

    const res = await request(app).post('/api/auth/verify').send({ number: otp.number, code: '00000' });
    expect(res.status).toBe(401);

    const updated = await Otp.findById(otp._id);
    expect(updated.tries).toBe(2);
  });

  test('200s, consumes the otp, and mints a token for a first-time user', async () => {
    const number = factories.phoneNumber();
    const otp = await factories.createOtp({ number, code: '54321' });

    const res = await request(app).post('/api/auth/verify').send({ number, code: '54321' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.number).toBe(number);
    expect(res.body.data.shops).toEqual([]);
    expect(typeof res.body.data.token).toBe('string');

    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(payload.uid).toBe(res.body.data.user._id);
    expect(await Otp.findById(otp._id)).toBeNull();
  });

  test('200s and reports owned shops for an existing owner', async () => {
    const user = await factories.createUser();
    const shop = await factories.createShop();
    await factories.createOwner({ user: user._id, shop: shop._id });
    const otp = await factories.createOtp({ number: user.number, code: '54321' });

    const res = await request(app).post('/api/auth/verify').send({ number: user.number, code: otp.code });

    expect(res.status).toBe(200);
    expect(res.body.data.shops).toHaveLength(1);
    expect(res.body.data.shops[0]._id).toBe(String(shop._id));
  });
});

// -------------------------------------------------------------------------- //

describe('POST /api/auth/mint', () => {
  test('401s without an authorization header', async () => {
    const res = await request(app).post('/api/auth/mint').send({ number: factories.phoneNumber() });
    expect(res.status).toBe(401);
  });

  test('401s with the wrong auth scheme', async () => {
    const res = await request(app)
      .post('/api/auth/mint')
      .set('Authorization', `Bearer ${process.env.SERVICE_KEY}`)
      .send({ number: factories.phoneNumber() });
    expect(res.status).toBe(401);
  });

  test('403s with the wrong service key', async () => {
    const res = await request(app)
      .post('/api/auth/mint')
      .set('Authorization', 'ApiKey wrong-key')
      .send({ number: factories.phoneNumber() });
    expect(res.status).toBe(403);
  });

  test('400s when the number is missing or invalid', async () => {
    const res = await request(app)
      .post('/api/auth/mint')
      .set('Authorization', factories.apiKey())
      .send({ number: 'not-a-number' });
    expect(res.status).toBe(400);
  });

  test('mints a token and upserts the user', async () => {
    const number = factories.phoneNumber();
    const res = await request(app)
      .post('/api/auth/mint')
      .set('Authorization', factories.apiKey())
      .send({ number });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');

    const user = await User.findOne({ number });
    expect(user).not.toBeNull();

    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(payload.uid).toBe(String(user._id));
  });
});
