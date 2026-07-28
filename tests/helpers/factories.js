const jwt = require('jsonwebtoken');

const User = require('../../src/models/User');
const Admin = require('../../src/models/Admin');
const Owner = require('../../src/models/Owner');
const Shop = require('../../src/models/Shop');
const Printer = require('../../src/models/Printer');
const Service = require('../../src/models/Service');
const File = require('../../src/models/File');
const Draft = require('../../src/models/Draft');
const Job = require('../../src/models/Job');
const History = require('../../src/models/History');
const Topup = require('../../src/models/Topup');
const Otp = require('../../src/models/Otp');

// -------------------------------------------------------------------------- //

let counter = 0;
const next = () => ++counter;

const phoneNumber = () => `923${String(next()).padStart(9, '0')}`;

// -------------------------------------------------------------------------- //

function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

function bearer(payload, options) {
  return `Bearer ${signToken(payload, options)}`;
}

function apiKey() {
  return `ApiKey ${process.env.SERVICE_KEY}`;
}

// -------------------------------------------------------------------------- //

async function createUser(overrides = {}) {
  return User.create({
    name: 'Test User',
    number: phoneNumber(),
    balance: 0,
    isDisabled: false,
    ...overrides,
  });
}

async function createAdmin(overrides = {}) {
  const user = overrides.user || await createUser();
  const appointedBy = overrides.appointedBy || (await createUser())._id;

  const admin = await Admin.create({
    _id: user._id,
    appointedBy,
    ...overrides,
  });

  return { admin, user };
}

async function createOwner(overrides = {}) {
  const user = overrides.user || (await createUser())._id;
  const shop = overrides.shop || (await createShop())._id;
  const appointedBy = overrides.appointedBy || (await createUser())._id;

  return Owner.create({
    user,
    shop,
    appointedBy,
    appointedByAdmin: false,
    ...overrides,
  });
}

async function createFile(overrides = {}) {
  const uploadedBy = overrides.uploadedBy || (await createUser())._id;

  return File.create({
    name: `file-${next()}.pdf`,
    type: 'pdf',
    numberOfPages: 10,
    uploadedBy,
    ...overrides,
  });
}

async function createShop(overrides = {}) {
  const imageFile = overrides.imageFile || (await createFile())._id;

  return Shop.create({
    name: `Test Shop ${next()}`,
    address: '123 Main Street',
    coordinates: [33.6844, 73.0479],
    contactNumber: '03001234567',
    timings: Array(7).fill('09:00-18:00'),
    isDisabled: false,
    ...overrides,
    imageFile,
  });
}

async function createPrinter(overrides = {}) {
  const shop = overrides.shop || (await createShop())._id;

  return Printer.create({
    name: `Printer ${next()}`,
    isDisabled: false,
    ...overrides,
    shop,
  });
}

function serviceName({ pageType, color, sidedness }) {
  return `${pageType}-${color ? 'CL' : 'BW'}-${sidedness ? 'DS' : 'SS'}`;
}

async function createService(overrides = {}) {
  const shop = overrides.shop || (await createShop())._id;
  const keys = { pageType: 'A4', color: false, sidedness: false, ...overrides.keys };

  let printers = overrides.printers;
  if (!printers) {
    const printer = await createPrinter({ shop });
    printers = [{ useAuto: true, printer: printer._id }];
  }

  return Service.create({
    name: serviceName(keys),
    rate: 5,
    isDisabled: false,
    ...overrides,
    keys,
    printers,
    shop,
  });
}

async function createDraft(overrides = {}) {
  const createdBy = overrides.createdBy || (await createUser())._id;

  return Draft.create({
    files: [],
    createdBy,
    ...overrides,
  });
}

function fileSettings(overrides = {}) {
  return {
    color: false,
    pageType: 'A4',
    pagesPerSheet: 1,
    orientation: 'portrait',
    sidedness: 'none',
    numberOfCopies: 1,
    pageSelection: '',
    ...overrides,
  };
}

async function createJob(overrides = {}) {
  const createdBy = overrides.createdBy || (await createUser())._id;
  const shop = overrides.shop || (await createShop())._id;

  let files = overrides.files;
  if (!files) {
    const file = await createFile({ uploadedBy: createdBy });
    files = [{ file: file._id, settings: fileSettings() }];
  }

  const cost = overrides.cost || { lines: [], extra: [], total: 10 };
  const status = overrides.status || 'submitted';

  return Job.create({
    files,
    shop,
    cost,
    createdBy,
    status,
    statusHistory: [{ by: 'user', status }],
    ...overrides,
  });
}

async function createHistory(overrides = {}) {
  const job = await createJob({ status: 'completed', ...overrides });
  const archived = job.toObject();
  delete archived._id;
  return History.create(archived);
}

async function createTopup(overrides = {}) {
  const createdBy = overrides.createdBy || (await createUser())._id;
  const paymentProofFile = overrides.paymentProofFile || (await createFile({ type: 'raw', numberOfPages: undefined, uploadedBy: createdBy }))._id;

  return Topup.create({
    status: 'pending',
    amount: 100,
    createdBy,
    ...overrides,
    paymentProofFile,
  });
}

async function createOtp(overrides = {}) {
  return Otp.create({
    code: '12345',
    tries: 3,
    lastSentAt: new Date(0),
    expiry: new Date(Date.now() + 5 * 60 * 1000),
    number: phoneNumber(),
    ...overrides,
  });
}

module.exports = {
  phoneNumber,
  signToken,
  bearer,
  apiKey,
  createUser,
  createAdmin,
  createOwner,
  createFile,
  createShop,
  createPrinter,
  createService,
  createDraft,
  createJob,
  createHistory,
  createTopup,
  createOtp,
  fileSettings,
  serviceName,
};
