const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const { pipeline } = require('stream/promises');

const File = require('../models/File');
const { resp } = require('../func/misc');
const { jwtAuth, keyAuth } = require('../func/auth');

// -------------------------------------------------------------------------- //

function buildFormData(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  return form;
}

// -------------------------------------------------------------------------- //

const jobs = new Map();
const router = express.Router();
const STORAGE_DIR = path.join(process.cwd(), 'files');

for (const dir of [STORAGE_DIR, `${STORAGE_DIR}/temp`]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  dest: `${STORAGE_DIR}/temp`,
  limits: { fileSize: 100 * 1024 * 1024 },
});

function validateFileId(fileId) {
  return /^[0-9a-f-]{1,64}$/i.test(fileId)
}

// -------------------------------------------------------------------------- //

async function serveFile(req, res, prefix = '') {
  const { fileId } = req.params;

  const filePath = path.join(STORAGE_DIR, prefix, fileId);

  if (!validateFileId(fileId) || !fs.existsSync(filePath)) {
    return resp(res, 404, 'File Not Found');
  }

  // Downloads use the stored file name. Temp files have no record yet, so they
  // fall back to the file id with a .pdf extension.
  let filename = `${fileId}.pdf`;
  if (!prefix) {
    const record = await File.findById(fileId).select('name').lean();
    if (record?.name) filename = record.name;
  }

  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const readStream = fs.createReadStream(filePath);
  readStream.on('error', () => res.destroy());

  return readStream.pipe(res);
}

router.get('/:fileId', (req, res) => serveFile(req, res));
router.get('/temp/:fileId', keyAuth, (req, res) => serveFile(req, res, 'temp'));

// -------------------------------------------------------------------------- //

router.put('/:fileId', keyAuth, async (req, res) => {
  const { fileId } = req.params;
  if (!validateFileId(fileId)) return resp(res, 404, 'File Not Found');

  const promise = jobs.get(fileId);
  const filePath = path.join(STORAGE_DIR, 'temp', fileId);

  await pipeline(req, fs.createWriteStream(filePath));

  if (promise) {
    jobs.delete(fileId);
    promise.resolve(fileId);
  }

  return resp(res, 200, 'Updated File Successfully', { fileId });
});

// -------------------------------------------------------------------------- //

router.post('/', jwtAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return resp(res, 400, 'no file provided');

  // `convert` is mandatory and controls whether the file is converted to a PDF
  // for printing. When false, the raw file is stored as-is (e.g. generic
  // uploads) with no conversion or metadata extraction.
  const convertRaw = String(req.body.convert).toLowerCase();
  if (convertRaw !== 'true' && convertRaw !== 'false') {
    return resp(res, 400, 'convert field is required and must be true or false');
  }
  const convert = convertRaw === 'true';

  if (!convert) {
    const file = await File.create({
      type: 'raw',
      name: req.file.originalname,
      uploadedBy: req.token.uid,
    });

    await file.populate('uploadedBy', 'name number');
    fs.renameSync(req.file.path, path.join(STORAGE_DIR, file._id.toString()));

    return resp(res, 201, 'file uploaded', { file });
  }

  if (req.file.mimetype !== 'application/pdf') {
    const promise = new Promise((resolve, reject) => {
      jobs.set(req.file.filename, { resolve, reject, file: req.file })
    });

    await fetch(`${process.env.GOTENBERG_URL}/forms/libreoffice/convert`, {
      method: 'POST',
      headers: {
        'Gotenberg-Webhook-Url': `${process.env.GOTENBERG_WEBHOOK_URL}/api/files/${req.file.filename}`,
        'Gotenberg-Webhook-Error-Url': `${process.env.GOTENBERG_WEBHOOK_URL}/api/files/${req.file.filename}`,
        'Gotenberg-Webhook-Method': 'PUT',
        'Gotenberg-Webhook-Error-Method': 'PUT',
        'Gotenberg-Webhook-Extra-Http-Headers': JSON.stringify({
          'Authorization': `ApiKey ${process.env.SERVICE_KEY}`
        })
      },
      body: buildFormData({
        downloadFrom: [{
          url: `${process.env.GOTENBERG_WEBHOOK_URL}/api/files/temp/${req.file.filename}`,
          extraHttpHeaders: { 'Authorization': `ApiKey ${process.env.SERVICE_KEY}` }
        }]
      })
    });

    await promise;
  }

  const response = await fetch(`${process.env.GOTENBERG_URL}/forms/pdfengines/metadata/read`, {
    method: 'POST',
    body: buildFormData({
      downloadFrom: [{
        url: `${process.env.GOTENBERG_WEBHOOK_URL}/api/files/temp/${req.file.filename}`,
        extraHttpHeaders: { 'Authorization': `ApiKey ${process.env.SERVICE_KEY}` }
      }]
    })
  });

  const metadata = Object.values(await response.json())[0];

  const file = await File.create({
    type: 'pdf',
    name: req.file.originalname,
    uploadedBy: req.token.uid,
    numberOfPages: metadata.PageCount,
  })

  await file.populate('uploadedBy', 'name number');
  fs.renameSync(req.file.path, path.join(STORAGE_DIR, file._id.toString()));

  return resp(res, 201, 'file uploaded', { file });
});

// -------------------------------------------------------------------------- //

module.exports = router;