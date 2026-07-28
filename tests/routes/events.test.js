const http = require('http');

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

// Opens a raw HTTP connection to `path`, resolves with the response status,
// headers, and first chunk of body, then destroys the socket so the
// server-side SSE handler's `req.on('close', ...)` cleanup fires.
function openSse(server, path, headers) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.once('data', (chunk) => {
        req.destroy();
        resolve({ status: res.statusCode, headers: res.headers, body: chunk.toString() });
      });
      res.on('error', () => {});
    });
    req.on('error', reject);
    req.end();
  });
}

// -------------------------------------------------------------------------- //

describe('GET /api/events/:shopId', () => {
  let server;

  beforeEach((done) => {
    server = app.listen(0, done);
  });

  afterEach((done) => {
    server.close(done);
  });

  test('403s for someone who does not own the shop', async () => {
    const shop = await factories.createShop();
    const user = await factories.createUser();
    const token = factories.bearer({ uid: String(user._id) });

    const res = await openSse(server, `/api/events/${shop._id}`, { Authorization: token });
    expect(res.status).toBe(403);
  });

  test('opens an event stream for the shop owner', async () => {
    const shop = await factories.createShop();
    const owner = await factories.createUser();
    await factories.createOwner({ user: owner._id, shop: shop._id });
    const token = factories.bearer({ uid: String(owner._id) });

    const res = await openSse(server, `/api/events/${shop._id}`, { Authorization: token });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: connected');
  });
});
