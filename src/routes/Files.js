const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const contentDisposition = require('content-disposition');
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');

const Job = require('../models/Job');
const File = require('../models/File');
const Shop = require('../models/Shop');
const Owner = require('../models/Owner');
const { resp } = require('../func/misc');
const { jwtAuth, isAdmin } = require('../func/auth');

// -------------------------------------------------------------------------- //

// Every file is kept twice: the bytes exactly as uploaded, and a PDF rendition
// used for printing. In-flight tus uploads are staged separately.
const STORAGE_DIR = path.join(process.cwd(), 'files');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const ORIGINAL_DIR = path.join(STORAGE_DIR, 'original');
const PDF_DIR = path.join(STORAGE_DIR, 'pdf');

for (const dir of [UPLOAD_DIR, ORIGINAL_DIR, PDF_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_SIZE = 100 * 1024 * 1024;
const UPLOAD_EXPIRY = 24 * 60 * 60 * 1000;
const ACTIVE_JOB_STATUSES = ['submitted', 'queued', 'printing'];

function validateFileId(fileId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fileId);
}

function validateMimeType(mimeType) {
  return typeof mimeType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType);
}

// tus errors are sent as-is, so keep them in the usual response shape.
function tusError(status_code, message) {
  return { status_code, body: JSON.stringify({ success: false, message, data: {} }) };
}

// tus hooks get a web Request; the express request (with req.token) sits
// underneath it.
function expressReq(req) {
  return req.runtime?.node?.req ?? req.node?.req;
}

// -------------------------------------------------------------------------- //

async function isPdf(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(5), 0, 5, 0);
    return bytesRead === 5 && buffer.toString('latin1') === '%PDF-';
  } finally {
    await handle.close();
  }
}

async function gotenberg(route, filePath, filename) {
  const form = new FormData();
  form.append('files', await fs.openAsBlob(filePath), filename);

  const res = await fetch(`${process.env.GOTENBERG_URL}${route}`, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`gotenberg ${route} responded ${res.status}: ${await res.text()}`);
  }
  return res;
}

// Produces pdfPath from the staged upload and returns its page count. PDFs are
// copied as-is; anything else goes through LibreOffice, which picks the input
// format from the file extension, hence the original filename.
async function convertToPdf(srcPath, filename, pdfPath, alreadyPdf) {
  if (alreadyPdf) {
    await fs.promises.copyFile(srcPath, pdfPath);
  } else {
    const res = await gotenberg('/forms/libreoffice/convert', srcPath, filename);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(pdfPath));
  }

  const res = await gotenberg('/forms/pdfengines/metadata/read', pdfPath, 'file.pdf');
  const metadata = Object.values(await res.json())[0];
  return metadata?.PageCount;
}

// -------------------------------------------------------------------------- //

const datastore = new FileStore({
  directory: UPLOAD_DIR,
  expirationPeriodInMilliseconds: UPLOAD_EXPIRY,
});

const server = new Server({
  path: '/api/files',
  datastore,
  maxSize: MAX_SIZE,
  respectForwardedHeaders: true,
  namingFunction: () => crypto.randomUUID(),

  // Validate the metadata up front and record the uploader, so later tus
  // requests can be restricted to them.
  async onUploadCreate(req, upload) {
    const filename = upload.metadata?.filename?.trim();
    if (!filename || filename.length > 255 || !File.validateFileName(filename)) {
      throw tusError(400, 'metadata filename is missing or invalid');
    }

    return {
      metadata: { ...upload.metadata, filename, uid: expressReq(req).token.uid },
    };
  },

  // Runs inside the request that delivers the last byte, so the client only
  // gets a response once the file is converted and saved. Any failure fails
  // the upload and discards everything written for it.
  async onUploadFinish(req, upload) {
    const { id, metadata } = upload;
    const stagedPath = path.join(UPLOAD_DIR, id);
    const originalPath = path.join(ORIGINAL_DIR, id);
    const pdfPath = path.join(PDF_DIR, id);

    let file;
    try {
      const pdfUpload = await isPdf(stagedPath);
      const numberOfPages = await convertToPdf(stagedPath, metadata.filename, pdfPath, pdfUpload);

      // tus still reads the staged upload after this hook returns (for
      // Upload-Expires), so link it into place now and drop it once the
      // response is out.
      await fs.promises.link(stagedPath, originalPath)
        .catch(() => fs.promises.copyFile(stagedPath, originalPath));

      const mimeType = pdfUpload
        ? 'application/pdf'
        : validateMimeType(metadata.filetype) ? metadata.filetype : 'application/octet-stream';

      file = await File.create({
        _id: id,
        name: metadata.filename,
        mimeType,
        size: upload.size,
        numberOfPages,
        uploadedBy: metadata.uid,
      });
    } catch (err) {
      console.error('[ERROR] File upload failed:', err);
      await Promise.allSettled([
        fs.promises.rm(pdfPath, { force: true }),
        fs.promises.rm(originalPath, { force: true }),
        datastore.remove(id),
      ]);
      throw tusError(422, 'file conversion failed');
    }

    expressReq(req).res.once('close', () => datastore.remove(id).catch(() => {}));
    await file.populate(File.filePopulate);

    // A POST (creation-with-upload) keeps its 201 so tus still sends Location.
    return {
      status_code: req.method === 'POST' ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'file uploaded', data: { file } }),
    };
  },
});

if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    server.cleanUpExpiredUploads().catch((err) => {
      console.error('[ERROR] Failed to clean up expired uploads:', err);
    });
  }, 60 * 60 * 1000).unref();
}

// -------------------------------------------------------------------------- //

const router = express.Router();

// tus and plain downloads share /:fileId (both use HEAD), so requests are told
// apart by the Tus-Resumable header every tus request carries.
const isTus = (req, res, next) => (req.get('Tus-Resumable') ? next() : next('route'));
const tus = (req, res) => server.handle(req, res);

// Only the uploader may touch an in-flight upload.
async function ownsUpload(req, res, next) {
  const { fileId } = req.params;
  if (!validateFileId(fileId)) return resp(res, 404, 'File Not Found');

  try {
    const upload = await datastore.getUpload(fileId);
    if (upload.metadata?.uid !== req.token.uid) return resp(res, 404, 'File Not Found');
  } catch {
    return resp(res, 404, 'File Not Found');
  }

  return next();
}

router.post('/', jwtAuth, tus);
router.all('/:fileId', isTus, jwtAuth, ownsUpload, tus);

// -------------------------------------------------------------------------- //

// Uploaders can read their own files and admins can read any file. Any user
// can read a shop's image, and shop owners can read files attached to active
// jobs at their shop.
async function canDownload(uid, file) {
  if (String(file.uploadedBy) === uid) return true;
  if (await isAdmin(uid)) return true;
  if (await Shop.exists({ imageFile: file._id })) return true;

  const shops = await Owner.distinct('shop', { user: uid });
  if (shops.length === 0) return false;

  return Boolean(await Job.exists({
    shop: { $in: shops },
    status: { $in: ACTIVE_JOB_STATUSES },
    $or: [{ 'files.file': file._id }, { paymentProofFile: file._id }],
  }));
}

// Serves the original by default, or the PDF rendition when the Accept header
// prefers application/pdf. Range requests are handled by sendFile.
router.get('/:fileId', jwtAuth, async (req, res, next) => {
  const { fileId } = req.params;
  if (!validateFileId(fileId)) return resp(res, 404, 'File Not Found');

  const file = await File.findById(fileId).lean();
  if (!file || !await canDownload(req.token.uid, file)) {
    return resp(res, 404, 'File Not Found');
  }

  const type = req.accepts([file.mimeType, 'application/pdf']);
  if (!type) return resp(res, 406, 'Not Acceptable');

  const asPdf = type === 'application/pdf';
  const filePath = path.join(asPdf ? PDF_DIR : ORIGINAL_DIR, file._id);
  const filename = asPdf ? `${file.name.replace(/\.[^.]*$/, '')}.pdf` : file.name;

  res.vary('Accept');
  res.set({
    'Content-Type': asPdf ? 'application/pdf' : file.mimeType,
    'Content-Disposition': contentDisposition(filename, { type: 'inline' }),
    'Cache-Control': 'private, no-cache',
  });

  return res.sendFile(filePath, { cacheControl: false }, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

// -------------------------------------------------------------------------- //

module.exports = router;
