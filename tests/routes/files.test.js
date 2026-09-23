const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/db');

const STORAGE_DIR = path.join(process.cwd(), 'files');
const DIRS = ['uploads', 'original', 'pdf'].map((d) => path.join(STORAGE_DIR, d));

const PDF_BYTES = Buffer.from('%PDF-1.4 converted pdf content');
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let app;
let File;
let History;
let factories;

beforeAll(async () => {
  await connectTestDb();
  app = require('../../src/app');
  File = require('../../src/models/File');
  History = require('../../src/models/History');
  factories = require('../helpers/factories');
});

beforeEach(() => {
  global.fetch = jest.fn(gotenbergMock());
});

afterEach(async () => {
  await clearTestDb();
  for (const dir of DIRS) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  }
});

afterAll(async () => {
  await closeTestDb();
});

// -------------------------------------------------------------------------- //

// Stands in for Gotenberg: the LibreOffice route returns PDF bytes, the
// metadata route returns a page count.
function gotenbergMock({ convertStatus = 200, pageCount = 3 } = {}) {
  return async (url) => {
    if (url.endsWith('/forms/libreoffice/convert')) {
      return new Response(convertStatus === 200 ? PDF_BYTES : 'conversion error', { status: convertStatus });
    }
    if (url.endsWith('/forms/pdfengines/metadata/read')) {
      return Response.json({ 'file.pdf': { PageCount: pageCount } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

async function authedUser() {
  const user = await factories.createUser();
  return { user, token: factories.bearer({ uid: String(user._id) }) };
}

const b64 = (value) => Buffer.from(value).toString('base64');

function createUpload(token, { length, filename = 'notes.docx', filetype = DOCX } = {}) {
  const metadata = [
    filename !== null && `filename ${b64(filename)}`,
    filetype !== null && `filetype ${b64(filetype)}`,
  ].filter(Boolean).join(',');

  const req = request(app)
    .post('/api/files')
    .set('Tus-Resumable', '1.0.0')
    .set('Upload-Length', String(length));
  if (token) req.set('Authorization', token);
  if (metadata) req.set('Upload-Metadata', metadata);
  return req;
}

function patchUpload(token, id, offset, body) {
  return request(app)
    .patch(`/api/files/${id}`)
    .set('Authorization', token)
    .set('Tus-Resumable', '1.0.0')
    .set('Upload-Offset', String(offset))
    .set('Content-Type', 'application/offset+octet-stream')
    .send(body);
}

async function eventually(assertion, timeout = 1000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return assertion();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

const idFromLocation = (res) => res.headers.location.split('/').pop();

// Full create + single PATCH upload; resolves with the final PATCH response.
async function upload(token, content, options = {}) {
  const created = await createUpload(token, { length: content.length, ...options });
  expect(created.status).toBe(201);
  return patchUpload(token, idFromLocation(created), 0, content);
}

// -------------------------------------------------------------------------- //

describe('tus upload', () => {
  test('401s without a token', async () => {
    const res = await createUpload(null, { length: 5 });
    expect(res.status).toBe(401);
  });

  test('412s without the Tus-Resumable header', async () => {
    const { token } = await authedUser();
    const res = await request(app).post('/api/files').set('Authorization', token);
    expect(res.status).toBe(412);
  });

  test('400s when the filename metadata is missing', async () => {
    const { token } = await authedUser();
    const res = await createUpload(token, { length: 5, filename: null });
    expect(res.status).toBe(400);
  });

  test('400s when the filename contains path characters', async () => {
    const { token } = await authedUser();
    const res = await createUpload(token, { length: 5, filename: '../etc/passwd' });
    expect(res.status).toBe(400);
  });

  test('413s when the upload is larger than the size limit', async () => {
    const { token } = await authedUser();
    const res = await createUpload(token, { length: 101 * 1024 * 1024 });
    expect(res.status).toBe(413);
  });

  test('resumes across chunks and converts once the last byte arrives', async () => {
    const { user, token } = await authedUser();
    const content = Buffer.from('hello world, this is a docx');

    const created = await createUpload(token, { length: content.length });
    expect(created.status).toBe(201);
    expect(created.headers.location).toMatch(/\/api\/files\/[0-9a-f-]{36}$/);
    const id = idFromLocation(created);

    const first = await patchUpload(token, id, 0, content.subarray(0, 10));
    expect(first.status).toBe(204);
    expect(first.headers['upload-offset']).toBe('10');
    expect(global.fetch).not.toHaveBeenCalled();

    const head = await request(app)
      .head(`/api/files/${id}`)
      .set('Authorization', token)
      .set('Tus-Resumable', '1.0.0');
    expect(head.status).toBe(200);
    expect(head.headers['upload-offset']).toBe('10');

    const last = await patchUpload(token, id, 10, content.subarray(10));
    expect(last.status).toBe(200);
    expect(last.body.success).toBe(true);
    expect(last.body.data.file).toMatchObject({
      _id: id,
      name: 'notes.docx',
      mimeType: DOCX,
      size: content.length,
      numberOfPages: 3,
    });
    expect(last.body.data.file.uploadedBy._id).toBe(String(user._id));
    expect(global.fetch).toHaveBeenCalledTimes(2);

    expect(fs.readFileSync(path.join(STORAGE_DIR, 'original', id))).toEqual(content);
    expect(fs.readFileSync(path.join(STORAGE_DIR, 'pdf', id))).toEqual(PDF_BYTES);
    expect(await File.exists({ _id: id })).toBeTruthy();

    // The staged tus copy is dropped once the response has gone out.
    await eventually(() => expect(fs.readdirSync(path.join(STORAGE_DIR, 'uploads'))).toEqual([]));
  });

  test('supports creation-with-upload in a single request', async () => {
    const { token } = await authedUser();
    const content = Buffer.from('single shot');

    const res = await createUpload(token, { length: content.length })
      .set('Content-Type', 'application/offset+octet-stream')
      .send(content);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBeDefined();
    expect(res.body.data.file.numberOfPages).toBe(3);
  });

  test('skips LibreOffice for pdf uploads and trusts the bytes over the declared type', async () => {
    const { token } = await authedUser();
    const content = Buffer.from('%PDF-1.4 an actual pdf');

    const res = await upload(token, content, { filename: 'doc.pdf', filetype: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.data.file.mimeType).toBe('application/pdf');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/metadata\/read$/);
    expect(fs.readFileSync(path.join(STORAGE_DIR, 'pdf', res.body.data.file._id))).toEqual(content);
  });

  test('fails the upload and leaves nothing behind when conversion fails', async () => {
    const { token } = await authedUser();
    global.fetch = jest.fn(gotenbergMock({ convertStatus: 500 }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const content = Buffer.from('not convertible');
    const created = await createUpload(token, { length: content.length, filename: 'weird.xyz' });
    const id = idFromLocation(created);
    const res = await patchUpload(token, id, 0, content);

    expect(res.status).toBe(422);
    expect(JSON.parse(res.text).success).toBe(false);
    expect(await File.exists({ _id: id })).toBeNull();
    for (const dir of DIRS) expect(fs.readdirSync(dir)).toEqual([]);

    const head = await request(app)
      .head(`/api/files/${id}`)
      .set('Authorization', token)
      .set('Tus-Resumable', '1.0.0');
    expect(head.status).toBe(404);

    console.error.mockRestore();
  });

  test("404s when another user touches someone else's upload", async () => {
    const { token } = await authedUser();
    const { token: otherToken } = await authedUser();

    const created = await createUpload(token, { length: 10 });
    const id = idFromLocation(created);

    const head = await request(app)
      .head(`/api/files/${id}`)
      .set('Authorization', otherToken)
      .set('Tus-Resumable', '1.0.0');
    expect(head.status).toBe(404);

    const patch = await patchUpload(otherToken, id, 0, Buffer.from('0123456789'));
    expect(patch.status).toBe(404);
  });

  test('lets the uploader terminate an unfinished upload', async () => {
    const { token } = await authedUser();
    const created = await createUpload(token, { length: 10 });
    const id = idFromLocation(created);

    const res = await request(app)
      .delete(`/api/files/${id}`)
      .set('Authorization', token)
      .set('Tus-Resumable', '1.0.0');

    expect(res.status).toBe(204);
    expect(fs.readdirSync(path.join(STORAGE_DIR, 'uploads'))).toEqual([]);
  });
});

// -------------------------------------------------------------------------- //

describe('GET /api/files/:fileId', () => {
  const CONTENT = Buffer.from('hello world, original bytes');

  async function uploadedFile() {
    const owner = await authedUser();
    const res = await upload(owner.token, CONTENT);
    return { ...owner, file: res.body.data.file };
  }

  test('401s without a token', async () => {
    const res = await request(app).get(`/api/files/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
  });

  test('404s for a malformed id', async () => {
    const { token } = await authedUser();
    const res = await request(app).get('/api/files/not-a-uuid').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  test('404s for an unknown id', async () => {
    const { token } = await authedUser();
    const res = await request(app).get(`/api/files/${crypto.randomUUID()}`).set('Authorization', token);
    expect(res.status).toBe(404);
  });

  describe('access', () => {
    test('the uploader can download', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(200);
    });

    test('an admin can download', async () => {
      const { file } = await uploadedFile();
      const { user } = await factories.createAdmin();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', factories.bearer({ uid: String(user._id) }));
      expect(res.status).toBe(200);
    });

    test('another user gets a 404', async () => {
      const { file } = await uploadedFile();
      const { token } = await authedUser();
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(404);
    });

    test('any user can download a shop image', async () => {
      const { file } = await uploadedFile();
      await factories.createShop({ imageFile: file._id });
      const { token } = await authedUser();
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(200);
    });

    async function shopOwnerFor(jobOverrides) {
      const { user: uploader, file } = await uploadedFile();
      const { user: ownerUser, token } = await authedUser();
      const owner = await factories.createOwner({ user: ownerUser._id });
      await jobOverrides(owner.shop, uploader, file);
      return { token, file };
    }

    test('a shop owner can download files in an active job at their shop', async () => {
      const { token, file } = await shopOwnerFor((shop, uploader, f) => factories.createJob({
        shop, createdBy: uploader._id, status: 'queued',
        files: [{ file: f._id, settings: factories.fileSettings() }],
      }));
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(200);
    });

    test('a shop owner can download the payment proof of an active job at their shop', async () => {
      const { token, file } = await shopOwnerFor((shop, uploader, f) => factories.createJob({
        shop, createdBy: uploader._id, paymentProofFile: f._id,
      }));
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(200);
    });

    test('a shop owner gets a 404 once the job is finished', async () => {
      const { token, file } = await shopOwnerFor((shop, uploader, f) => factories.createHistory({
        shop, createdBy: uploader._id,
        files: [{ file: f._id, settings: factories.fileSettings() }],
      }));
      expect(await History.countDocuments()).toBe(1);
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(404);
    });

    test('a shop owner gets a 404 for jobs at a shop they do not own', async () => {
      const { user: uploader, file } = await uploadedFile();
      const { user: ownerUser, token } = await authedUser();
      await factories.createOwner({ user: ownerUser._id });
      await factories.createJob({
        createdBy: uploader._id,
        files: [{ file: file._id, settings: factories.fileSettings() }],
      });
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(404);
    });
  });

  describe('representation', () => {
    test('serves the original by default', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app).get(`/api/files/${file._id}`).set('Authorization', token).buffer(true).parse(binary);

      expect(res.headers['content-type']).toBe(DOCX);
      expect(res.headers['content-disposition']).toBe('inline; filename="notes.docx"');
      expect(res.headers.vary).toMatch(/Accept/);
      expect(res.body).toEqual(CONTENT);
    });

    test('serves the pdf for Accept: application/pdf', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Accept', 'application/pdf')
        .buffer(true).parse(binary);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe('inline; filename="notes.pdf"');
      expect(res.body).toEqual(PDF_BYTES);
    });

    test('406s when neither representation is acceptable', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Accept', 'image/png');
      expect(res.status).toBe(406);
    });
  });

  describe('ranges', () => {
    test('HEAD advertises byte ranges', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app).head(`/api/files/${file._id}`).set('Authorization', token);
      expect(res.status).toBe(200);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-length']).toBe(String(CONTENT.length));
    });

    test('serves a partial range', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Range', 'bytes=6-10')
        .buffer(true).parse(binary);

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 6-10/${CONTENT.length}`);
      expect(res.body.toString()).toBe('world');
    });

    test('serves a partial range of the pdf', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Accept', 'application/pdf')
        .set('Range', 'bytes=0-4')
        .buffer(true).parse(binary);

      expect(res.status).toBe(206);
      expect(res.body.toString()).toBe('%PDF-');
    });

    test('ignores the range when If-Range no longer matches', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Range', 'bytes=0-4')
        .set('If-Range', '"stale-etag"');
      expect(res.status).toBe(200);
    });

    test('416s for an unsatisfiable range', async () => {
      const { token, file } = await uploadedFile();
      const res = await request(app)
        .get(`/api/files/${file._id}`)
        .set('Authorization', token)
        .set('Range', `bytes=${CONTENT.length + 10}-`);
      expect(res.status).toBe(416);
    });
  });
});

// supertest only buffers text-ish bodies by default.
function binary(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
