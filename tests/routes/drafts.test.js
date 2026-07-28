const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

let app;
let Draft;
let Job;
let User;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  Draft = require('../../src/models/Draft');
  Job = require('../../src/models/Job');
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
  const { user } = await factories.createAdmin();
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

async function authedUser(overrides = {}) {
  const user = await factories.createUser(overrides);
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

// Sets up a shop with a service that matches factories.fileSettings() defaults
// (A4, simplex, mono) so /check and /submit can price a draft successfully.
async function shopWithMatchingService(rate = 5) {
  const shop = await factories.createShop();
  await factories.createService({ shop: shop._id, rate, keys: { pageType: 'A4', color: false, sidedness: false } });
  return shop;
}

// -------------------------------------------------------------------------- //

describe('POST /api/drafts', () => {
  test('400s when shop is a valid id but does not exist', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/drafts')
      .set('Authorization', token)
      .send({ shop: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(400);
  });

  test('400s when files is not a non-empty array', async () => {
    const { token } = await authedUser();
    const res = await request(app).post('/api/drafts').set('Authorization', token).send({ files: [] });
    expect(res.status).toBe(400);
  });

  test('400s when a referenced file does not exist', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/drafts')
      .set('Authorization', token)
      .send({ files: [{ file: '00000000-0000-4000-8000-000000000000' }] });
    expect(res.status).toBe(400);
  });

  test('400s when a referenced file is not a pdf', async () => {
    const { user, token } = await authedUser();
    const rawFile = await factories.createFile({ type: 'raw', numberOfPages: undefined, uploadedBy: user._id });

    const res = await request(app)
      .post('/api/drafts')
      .set('Authorization', token)
      .send({ files: [{ file: rawFile._id }] });
    expect(res.status).toBe(400);
  });

  test('creates a draft owned by the caller', async () => {
    const { user, token } = await authedUser();
    const shop = await factories.createShop();

    const res = await request(app).post('/api/drafts').set('Authorization', token).send({ shop: String(shop._id) });

    expect(res.status).toBe(201);
    expect(res.body.data.draft.createdBy._id).toBe(String(user._id));
  });
});

describe('GET /api/drafts/:draftId', () => {
  test('404s for a missing draft', async () => {
    const { token } = await authedUser();
    const res = await request(app).get('/api/drafts/507f1f77bcf86cd799439011').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('403s for a stranger', async () => {
    const draft = await factories.createDraft();
    const { token } = await authedUser();

    const res = await request(app).get(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(403);
  });

  test('200s for the owner', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });

    const res = await request(app).get(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });

  test('200s for an admin viewing someone else’s draft', async () => {
    const draft = await factories.createDraft();
    const { token } = await asAdmin();

    const res = await request(app).get(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/drafts', () => {
  test('only lists the caller’s own drafts when not an admin', async () => {
    const { user, token } = await authedUser();
    await factories.createDraft({ createdBy: user._id });
    await factories.createDraft();

    const res = await request(app).get('/api/drafts').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.drafts).toHaveLength(1);
  });

  test('lists every draft for an admin', async () => {
    const { token } = await asAdmin();
    await factories.createDraft();
    await factories.createDraft();

    const res = await request(app).get('/api/drafts').set('Authorization', token);
    expect(res.body.data.drafts).toHaveLength(2);
  });
});

describe('PUT /api/drafts/:draftId', () => {
  test('403s for a non-owner, including an admin', async () => {
    const draft = await factories.createDraft();
    const { token } = await asAdmin();

    const res = await request(app).put(`/api/drafts/${draft._id}`).set('Authorization', token).send({});
    expect(res.status).toBe(403);
  });

  test('400s when shop is cleared', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });

    const res = await request(app).put(`/api/drafts/${draft._id}`).set('Authorization', token).send({ shop: null });
    expect(res.status).toBe(400);
  });

  test('400s when files is not an array', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });

    const res = await request(app)
      .put(`/api/drafts/${draft._id}`)
      .set('Authorization', token)
      .send({ files: 'nope' });
    expect(res.status).toBe(400);
  });

  test('updates the shop and files as the owner', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });
    const shop = await factories.createShop();
    const file = await factories.createFile({ uploadedBy: user._id });

    const res = await request(app)
      .put(`/api/drafts/${draft._id}`)
      .set('Authorization', token)
      .send({ shop: String(shop._id), files: [{ file: file._id }] });

    expect(res.status).toBe(200);
    expect(res.body.data.draft.shop._id).toBe(String(shop._id));
    expect(res.body.data.draft.files).toHaveLength(1);
  });
});

describe('DELETE /api/drafts/:draftId', () => {
  test('403s for a stranger', async () => {
    const draft = await factories.createDraft();
    const { token } = await authedUser();

    const res = await request(app).delete(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(403);
  });

  test('lets an admin delete someone else’s draft', async () => {
    const draft = await factories.createDraft();
    const { token } = await asAdmin();

    const res = await request(app).delete(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
    expect(await Draft.exists({ _id: draft._id })).toBeFalsy();
  });

  test('lets the owner delete their own draft', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });

    const res = await request(app).delete(`/api/drafts/${draft._id}`).set('Authorization', token);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/drafts/:draftId/check', () => {
  test('403s for a non-owner', async () => {
    const draft = await factories.createDraft();
    const { token } = await authedUser();

    const res = await request(app).patch(`/api/drafts/${draft._id}/check`).set('Authorization', token);
    expect(res.status).toBe(403);
  });

  test('400s when the draft has no shop', async () => {
    const { user, token } = await authedUser();
    const draft = await factories.createDraft({ createdBy: user._id });

    const res = await request(app).patch(`/api/drafts/${draft._id}/check`).set('Authorization', token);
    expect(res.status).toBe(400);
  });

  test('400s when a file is missing settings', async () => {
    const { user, token } = await authedUser();
    const shop = await shopWithMatchingService();
    const file = await factories.createFile({ uploadedBy: user._id });
    const draft = await factories.createDraft({ createdBy: user._id, shop: shop._id, files: [{ file: file._id }] });

    const res = await request(app).patch(`/api/drafts/${draft._id}/check`).set('Authorization', token);
    expect(res.status).toBe(400);
  });

  test('400s when no service matches the requested settings', async () => {
    const { user, token } = await authedUser();
    const shop = await factories.createShop();
    await factories.createService({ shop: shop._id, keys: { pageType: 'A3', color: true, sidedness: true } });
    const file = await factories.createFile({ uploadedBy: user._id, numberOfPages: 10 });
    const draft = await factories.createDraft({
      createdBy: user._id,
      shop: shop._id,
      files: [{ file: file._id, settings: factories.fileSettings() }],
    });

    const res = await request(app).patch(`/api/drafts/${draft._id}/check`).set('Authorization', token);
    expect(res.status).toBe(400);
  });

  test('prices the draft and persists the cost', async () => {
    const { user, token } = await authedUser();
    const shop = await shopWithMatchingService(5);
    const file = await factories.createFile({ uploadedBy: user._id, numberOfPages: 10 });
    const draft = await factories.createDraft({
      createdBy: user._id,
      shop: shop._id,
      files: [{ file: file._id, settings: factories.fileSettings() }],
    });

    const res = await request(app).patch(`/api/drafts/${draft._id}/check`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.draft.cost.total).toBe(10 * 5 + 10); // 10 sheets * rate 5 + flat Test Fee
  });
});

describe('PATCH /api/drafts/:draftId/submit', () => {
  test('403s for a non-owner', async () => {
    const draft = await factories.createDraft();
    const { token } = await authedUser();

    const res = await request(app).patch(`/api/drafts/${draft._id}/submit`).set('Authorization', token);
    expect(res.status).toBe(403);
  });

  test('402s when the user cannot afford the job', async () => {
    const { user, token } = await authedUser({ balance: 0 });
    const shop = await shopWithMatchingService(5);
    const file = await factories.createFile({ uploadedBy: user._id, numberOfPages: 10 });
    const draft = await factories.createDraft({
      createdBy: user._id,
      shop: shop._id,
      files: [{ file: file._id, settings: factories.fileSettings() }],
    });

    const res = await request(app).patch(`/api/drafts/${draft._id}/submit`).set('Authorization', token);
    expect(res.status).toBe(402);
  });

  test('submits the draft: creates a job, deletes the draft, and deducts the balance', async () => {
    const { user, token } = await authedUser({ balance: 1000 });
    const shop = await shopWithMatchingService(5);
    const file = await factories.createFile({ uploadedBy: user._id, numberOfPages: 10 });
    const draft = await factories.createDraft({
      createdBy: user._id,
      shop: shop._id,
      files: [{ file: file._id, settings: factories.fileSettings() }],
    });

    const res = await request(app).patch(`/api/drafts/${draft._id}/submit`).set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('submitted');
    expect(res.body.data.job.cost.total).toBe(60);

    expect(await Draft.exists({ _id: draft._id })).toBeFalsy();
    expect(await Job.exists({ shop: shop._id, createdBy: user._id })).toBeTruthy();

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.balance).toBe(1000 - 60);
  });
});
