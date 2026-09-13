const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Contact;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Contact = require('../../src/models/Contact');
  factories = require('../helpers/factories');
});

beforeEach(() => {
  // sendViaNotifyBot goes through global fetch; never hit the real bot.
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

const formBody = (overrides = {}) => ({
  name: 'Test User',
  email: 'Test@Example.com',
  number: '0300 1234567',
  message: 'Hello there',
  ...overrides,
});

const registerBody = (overrides = {}) => ({
  name: 'Test Owner',
  number: '923001234567',
  shopName: 'Test Shop',
  shopAddress: '123 Main Street',
  ...overrides,
});

const notifyMessage = () => JSON.parse(global.fetch.mock.calls[0][1].body).message;

// -------------------------------------------------------------------------- //

describe('POST /api/contact/form', () => {
  test('creates a submission without auth, normalises fields and notifies', async () => {
    const res = await request(app).post('/api/contact/form').send(formBody());

    expect(res.status).toBe(201);
    expect(res.body.data.contact.type).toBe('form');
    expect(res.body.data.contact.fields).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      number: '923001234567',
      message: 'Hello there',
    });

    expect(await Contact.countDocuments({ type: 'form' })).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(notifyMessage()).toContain('email: test@example.com');
  });

  test('400s when a required field is missing', async () => {
    const res = await request(app).post('/api/contact/form').send(formBody({ message: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/message/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('400s for an invalid email', async () => {
    const res = await request(app).post('/api/contact/form').send(formBody({ email: 'nope' }));
    expect(res.status).toBe(400);
  });

  test('400s for an invalid number', async () => {
    const res = await request(app).post('/api/contact/form').send(formBody({ number: '12345' }));
    expect(res.status).toBe(400);
  });

  test('ignores fields that do not belong to the form', async () => {
    const res = await request(app).post('/api/contact/form').send(formBody({ shopName: 'x', type: 'register' }));
    expect(res.status).toBe(201);
    expect(res.body.data.contact.type).toBe('form');
    expect(res.body.data.contact.fields.shopName).toBeUndefined();
  });

  test('still succeeds when the notify bot fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/api/contact/form').send(formBody());
    expect(res.status).toBe(201);

    console.error.mockRestore();
  });
});

describe('POST /api/contact/register', () => {
  test('creates a registration submission and notifies', async () => {
    const res = await request(app).post('/api/contact/register').send(registerBody());

    expect(res.status).toBe(201);
    expect(res.body.data.contact.type).toBe('register');
    expect(res.body.data.contact.fields.shopName).toBe('Test Shop');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(notifyMessage()).toContain('shopAddress: 123 Main Street');
  });

  test('400s when shopAddress exceeds 100 characters', async () => {
    const res = await request(app).post('/api/contact/register').send(registerBody({ shopAddress: 'a'.repeat(101) }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/contact', () => {
  test('401s without auth', async () => {
    const res = await request(app).get('/api/contact');
    expect(res.status).toBe(401);
  });

  test('403s for a non-admin', async () => {
    const user = await factories.createUser();
    const res = await request(app).get('/api/contact').set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(403);
  });

  test('lists all submissions newest first, optionally filtered by type', async () => {
    const { user } = await factories.createAdmin();
    const token = factories.bearer({ uid: String(user._id) });

    await request(app).post('/api/contact/form').send(formBody());
    await request(app).post('/api/contact/register').send(registerBody());

    const all = await request(app).get('/api/contact').set('Authorization', token);
    expect(all.status).toBe(200);
    expect(all.body.data.contacts.map((c) => c.type)).toEqual(['register', 'form']);

    const forms = await request(app).get('/api/contact?type=form').set('Authorization', token);
    expect(forms.body.data.contacts).toHaveLength(1);
    expect(forms.body.data.contacts[0].fields.email).toBe('test@example.com');
  });

  test('400s for an unknown type filter', async () => {
    const { user } = await factories.createAdmin();
    const res = await request(app)
      .get('/api/contact?type=bogus')
      .set('Authorization', factories.bearer({ uid: String(user._id) }));
    expect(res.status).toBe(400);
  });
});
