const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

const STORAGE_DIR = path.join(process.cwd(), 'files');

let app;
let File;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  File = require('../../src/models/File');
  factories = require('../helpers/factories');
});

afterEach(async () => {
  await clearTestDb();
  for (const dir of [STORAGE_DIR, path.join(STORAGE_DIR, 'temp')]) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  }
  if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
});

afterAll(async () => {
  await closeTestDb();
});

function authedUser() {
  return factories.createUser().then((user) => ({
    user,
    token: factories.bearer({ uid: String(user._id) }),
  }));
}

// -------------------------------------------------------------------------- //

describe('POST /api/files', () => {
  test('401s without a token', async () => {
    const res = await request(app).post('/api/files').field('convert', 'false');
    expect(res.status).toBe(401);
  });

  test('400s when no file is attached', async () => {
    const { token } = await authedUser();
    const res = await request(app).post('/api/files').set('Authorization', token).field('convert', 'false');
    expect(res.status).toBe(400);
  });

  test('400s when convert is missing or invalid', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/files')
      .set('Authorization', token)
      .field('convert', 'maybe')
      .attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('stores a raw file untouched when convert=false', async () => {
    const { token } = await authedUser();

    const res = await request(app)
      .post('/api/files')
      .set('Authorization', token)
      .field('convert', 'false')
      .attach('file', Buffer.from('hello world'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    expect(res.body.data.file.type).toBe('raw');
    expect(res.body.data.file.name).toBe('notes.txt');

    const stored = await File.findById(res.body.data.file._id);
    expect(stored).not.toBeNull();
    expect(fs.existsSync(path.join(STORAGE_DIR, stored._id))).toBe(true);
  });

  test('converts a pdf upload by reading its metadata, skipping LibreOffice', async () => {
    const { token } = await authedUser();

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ 'file.pdf': { PageCount: 7 } }),
    });

    const res = await request(app)
      .post('/api/files')
      .set('Authorization', token)
      .field('convert', 'true')
      .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.data.file.type).toBe('pdf');
    expect(res.body.data.file.numberOfPages).toBe(7);
    // Only the metadata-read call is made; the LibreOffice conversion webhook is skipped for pdf uploads.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/files/:fileId', () => {
  test('404s for a malformed id', async () => {
    const res = await request(app).get('/api/files/not a valid id!');
    expect(res.status).toBe(404);
  });

  test('404s for a well-formed but unknown id', async () => {
    const res = await request(app).get(`/api/files/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  test('streams back a previously uploaded file with its stored name', async () => {
    const { token } = await authedUser();

    const upload = await request(app)
      .post('/api/files')
      .set('Authorization', token)
      .field('convert', 'false')
      .attach('file', Buffer.from('hello world'), { filename: 'notes.txt', contentType: 'text/plain' });

    const res = await request(app).get(`/api/files/${upload.body.data.file._id}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('notes.txt');
    expect(res.text).toBe('hello world');
  });
});

describe('PUT /api/files/:fileId (Gotenberg webhook)', () => {
  test('401s without a key', async () => {
    const res = await request(app).put(`/api/files/${crypto.randomUUID()}`).send(Buffer.from('bytes'));
    expect(res.status).toBe(401);
  });

  test('403s with the wrong key', async () => {
    const res = await request(app)
      .put(`/api/files/${crypto.randomUUID()}`)
      .set('Authorization', 'ApiKey wrong')
      .send(Buffer.from('bytes'));
    expect(res.status).toBe(403);
  });

  test('404s for a malformed id', async () => {
    const res = await request(app)
      .put('/api/files/not valid!')
      .set('Authorization', factories.apiKey())
      .send(Buffer.from('bytes'));
    expect(res.status).toBe(404);
  });

  test('writes the request body to the temp store', async () => {
    const fileId = crypto.randomUUID();

    const res = await request(app)
      .put(`/api/files/${fileId}`)
      .set('Authorization', factories.apiKey())
      .send(Buffer.from('converted bytes'));

    expect(res.status).toBe(200);
    expect(res.body.data.fileId).toBe(fileId);
    expect(fs.readFileSync(path.join(STORAGE_DIR, 'temp', fileId), 'utf8')).toBe('converted bytes');
  });
});

describe('GET /api/files/temp/:fileId', () => {
  test('401s without a key', async () => {
    const res = await request(app).get(`/api/files/temp/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
  });

  test('404s for an unknown temp file', async () => {
    const res = await request(app)
      .get(`/api/files/temp/${crypto.randomUUID()}`)
      .set('Authorization', factories.apiKey());
    expect(res.status).toBe(404);
  });

  test('streams back a temp file written via PUT', async () => {
    const fileId = crypto.randomUUID();

    await request(app)
      .put(`/api/files/${fileId}`)
      .set('Authorization', factories.apiKey())
      .send(Buffer.from('temp bytes'));

    const res = await request(app)
      .get(`/api/files/temp/${fileId}`)
      .set('Authorization', factories.apiKey());

    expect(res.status).toBe(200);
    expect(res.text).toBe('temp bytes');
  });
});
