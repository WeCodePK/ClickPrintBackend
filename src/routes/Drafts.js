const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const File = require('../models/File');
const Shop = require('../models/Shop');
const Owner = require('../models/Owner');
const Draft = require('../models/Draft');
const Service = require('../models/Service');

const { isAdmin, ownsShops } = require('../func/auth');
const { calculateJobCost } = require('../func/cost');
const { notifyShopOnJobsUpdate } = require('../func/sse');
const { resp, validateObjectIds } = require('../func/misc');
const { validateTransition, runSideEffects } = require('../func/jobs');

// -------------------------------------------------------------------------- //

// App drafts belong to the user who made them. Shop drafts belong to the shop,
// so any of its owners can work on them.
async function canEditDraft(uid, draft) {
  if (draft.source === 'shop') return ownsShops(uid, draft.shop);
  return draft.createdBy.equals(uid);
}

// A draft may only reference files the caller uploaded, or on shop drafts,
// files uploaded by any of that shop's owners.
async function canAttachFiles(fileIds, uid, { source, shop }) {
  const ids = [...new Set(fileIds.map(String))];
  const uploaders = source === 'shop' ? await Owner.distinct('user', { shop }) : [uid];
  const count = await File.countDocuments({ _id: { $in: ids }, uploadedBy: { $in: uploaders } });
  return count === ids.length;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// -------------------------------------------------------------------------- //

router.post('/', async (req, res) => {
  const { files, shop, additionalComments, paymentProofFile, source = 'app', channel, customer } = req.body || {};
  const { uid } = req.token;

  if (source !== 'app' && source !== 'shop') {
    return resp(res, 400, `source must be one of 'app', 'shop'`);
  }

  if (source === 'shop') {
    if (!shop || !validateObjectIds.check(shop) || !await ownsShops(uid, shop)) {
      return resp(res, 403, 'shop drafts require a shop you own');
    }
    if (customer !== undefined && !isPlainObject(customer)) {
      return resp(res, 400, 'customer must be an object');
    }
  }

  if (additionalComments !== undefined && typeof additionalComments !== 'string') {
    return resp(res, 400, 'additionalComments must be a string');
  }

  if (paymentProofFile !== undefined) {
    if (typeof paymentProofFile !== 'string' || !paymentProofFile) {
      return resp(res, 400, 'missing or invalid fields (paymentProofFile)');
    }
    if (!await canAttachFiles([paymentProofFile], uid, { source, shop })) {
      return resp(res, 400, 'payment proof file does not exist');
    }
  }

  if (shop && validateObjectIds.check(shop) && !await Shop.exists({ _id: shop })) {
    return resp(res, 400, 'shop does not exist');
  }

  if (files) {
    if (!Array.isArray(files) || files.length === 0) {
      return resp(res, 400, 'files must be an array of 1 or more objects');
    }

    if (files.some((file) => !file?.file)) {
      return resp(res, 400, `file does not exist`);
    }
    if (!await canAttachFiles(files.map((file) => file.file), uid, { source, shop })) {
      return resp(res, 400, `file does not exist`);
    }
  }

  const draft = await Draft.create({
    files, shop, additionalComments, paymentProofFile,
    ...(source === 'shop' && { source, channel, customer }),
    createdBy: uid,
  });

  await draft.populate(Draft.draftPopulate);
  return resp(res, 201, 'draft created', { draft });
});

// -------------------------------------------------------------------------- //

// GET /api/drafts lists every draft (admins only); GET /api/drafts/user/:userId
// lists one user's own app drafts (that user, or an admin on their behalf).
router.get(['/', '/user/:userId'], validateObjectIds('userId', { allowEmpty: true }), async (req, res) => {
  const { userId } = req.params;
  const admin = await isAdmin(req.token.uid);

  if (!admin && (!userId || userId !== req.token.uid)) {
    return resp(res, 403, 'forbidden');
  }

  const filter = userId ? { createdBy: userId, source: { $ne: 'shop' } } : {};
  const drafts = await Draft.find(filter).populate(Draft.draftPopulate);
  return resp(res, 200, 'fetched drafts', {drafts});
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owners: every draft the shop made for its customers.
router.get('/shop/:shopId', validateObjectIds('shopId'), async (req, res) => {
  const isAdm = await isAdmin(req.token.uid);
  const isOwner = await ownsShops(req.token.uid, req.params.shopId);

  if (!isAdm && !isOwner) return resp(res, 403, 'forbidden');

  const drafts = await Draft
    .find({ shop: req.params.shopId, source: 'shop' })
    .populate(Draft.draftPopulate);

  return resp(res, 200, 'fetched drafts', {drafts});
});

// -------------------------------------------------------------------------- //

router.get('/:draftId', validateObjectIds('draftId'), async (req, res) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await isAdmin(req.token.uid) && !await canEditDraft(req.token.uid, draft)) return resp(res, 403, 'forbidden');

  await draft.populate(Draft.draftPopulate);
  return resp(res, 200, 'fetched draft', {draft});
});

// -------------------------------------------------------------------------- //

router.put('/:draftId', validateObjectIds('draftId'), async (req, res) => {
  const { files, shop, additionalComments, paymentProofFile, channel, customer } = req.body || {};
  const { uid } = req.token;

  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await canEditDraft(uid, draft)) return resp(res, 403, 'forbidden');

  const isShopDraft = draft.source === 'shop';

  if (shop !== undefined) {
    if (!shop) {
      return resp(res, 400, 'shop cannot be cleared');
    }

    if (!validateObjectIds.check(shop) || !await Shop.exists({ _id: shop })) {
      return resp(res, 400, 'shop does not exist');
    }

    if (isShopDraft && !await ownsShops(uid, shop)) {
      return resp(res, 403, 'shop drafts require a shop you own');
    }

    draft.shop = shop;
  }

  if (files !== undefined) {
    if (!Array.isArray(files)) {
      return resp(res, 400, 'files must be an array');
    }

    if (files.some((file) => !file?.file)) {
      return resp(res, 400, `file does not exist`);
    }
    if (!await canAttachFiles(files.map((file) => file.file), uid, draft)) {
      return resp(res, 400, `file does not exist`);
    }

    draft.files = files;
  }

  if (additionalComments !== undefined) {
    if (typeof additionalComments !== 'string') {
      return resp(res, 400, 'additionalComments must be a string');
    }

    draft.additionalComments = additionalComments;
  }

  // Unlike shop, the payment proof is optional and may be detached again by
  // passing null or an empty string.
  if (paymentProofFile !== undefined) {
    if (paymentProofFile === null || paymentProofFile === '') {
      draft.paymentProofFile = undefined;
    }
    else if (typeof paymentProofFile !== 'string' || !await canAttachFiles([paymentProofFile], uid, draft)) {
      return resp(res, 400, 'payment proof file does not exist');
    }
    else {
      draft.paymentProofFile = paymentProofFile;
    }
  }

  if (channel !== undefined || customer !== undefined) {
    if (!isShopDraft) {
      return resp(res, 400, 'channel and customer can only be set on shop drafts');
    }

    if (channel !== undefined) {
      draft.channel = channel;
    }

    // Like the payment proof, the customer may be cleared with null.
    if (customer !== undefined) {
      if (customer !== null && !isPlainObject(customer)) {
        return resp(res, 400, 'customer must be an object');
      }
      draft.customer = customer ?? undefined;
    }
  }

  // Any edit can change the price, so drop it until the next check
  draft.cost = undefined;

  await draft.save();
  await draft.populate(Draft.draftPopulate);

  return resp(res, 200, 'draft updated', {draft});
});

// -------------------------------------------------------------------------- //

router.delete('/:draftId', validateObjectIds('draftId'), async (req, res) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await isAdmin(req.token.uid) && !await canEditDraft(req.token.uid, draft)) {
    return resp(res, 403, 'forbidden');
  }

  await Draft.deleteOne(draft);
  return resp(res, 200, 'draft deleted');
});

// -------------------------------------------------------------------------- //

router.patch('/:draftId/check', validateObjectIds('draftId'), async (req, res, next) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await canEditDraft(req.token.uid, draft)) return resp(res, 403, 'forbidden');

  if (!draft.shop) {
    return resp(res, 400, 'draft is missing shop');
  }

  if (!Array.isArray(draft.files) || draft.files.length === 0) {
    return resp(res, 400, 'draft has no files');
  }

  for (const [index, file] of draft.files.entries()) {
    if (!file.file) {
      return resp(res, 400, `files[${index}] is missing file`);
    }
    if (!file.settings) {
      return resp(res, 400, `files[${index}] is missing settings`);
    }
  }

  await draft.populate(Draft.draftPopulate);
  const services = await Service.find({ shop: draft.shop, isDisabled: false }).lean();

  try {
    draft.cost = calculateJobCost(draft.files, services);
  }
  catch (err) {
    return resp(res, 400, `unable to price job (${err.message})`);
  }

  await draft.save();
  return resp(res, 200, 'draft checked', {draft});
});

// -------------------------------------------------------------------------- //

router.patch('/:draftId/submit', validateObjectIds('draftId'), async (req, res, next) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await canEditDraft(req.token.uid, draft)) return resp(res, 403, 'forbidden');

  const role = draft.source === 'shop' ? 'shop' : 'user';
  const check = validateTransition('draft', 'submitted', role);
  if (!check.ok) return resp(res, check.code, check.message);

  // Re-run the same validation and cost calculation as /:draftId/check so the
  // job is priced fresh at submit time, regardless of whether the client ever
  // called /check first.
  if (!draft.shop) {
    return resp(res, 400, 'draft is missing shop');
  }

  if (!Array.isArray(draft.files) || draft.files.length === 0) {
    return resp(res, 400, 'draft has no files');
  }

  for (const [index, file] of draft.files.entries()) {
    if (!file.file) {
      return resp(res, 400, `files[${index}] is missing file`);
    }
    if (!file.settings) {
      return resp(res, 400, `files[${index}] is missing settings`);
    }
  }

  await draft.populate(Draft.draftPopulate);
  const services = await Service.find({ shop: draft.shop, isDisabled: false }).lean();

  try {
    draft.cost = calculateJobCost(draft.files, services);
  }
  catch (err) {
    return resp(res, 400, `unable to price job (${err.message})`);
  }

  // Revert the populated refs (shop, createdBy, files.file) back to ObjectIds
  // so the draft data can be copied straight into the new Job document.
  draft.depopulate();

  const session = await mongoose.startSession();

  try {
    let job;

    await session.withTransaction(async () => {
      await Draft.deleteOne({ _id: req.params.draftId }, { session });

      // Atomically claim the shop's next job number and wrap it into 0000-9999
      const counted = await Shop.findByIdAndUpdate(
        draft.shop,
        { $inc: { jobCounter: 1 } },
        { session, returnDocument: 'after', projection: { jobCounter: 1 } }
      );
      const code = String(counted.jobCounter % 10000).padStart(4, '0');

      [job] = await Job.create([{
        ...draft.toObject(),
        code,
        status: 'submitted',
        statusHistory: [{ by: role, status: 'submitted' }]
      }], { session });

      await runSideEffects('submitted', job, session);
    });

    notifyShopOnJobsUpdate(job.shop.toString());

    await job.populate(Job.jobPopulate);
    return resp(res, 200, 'job created', {job});
  }

  catch (err) {
    return next(err);
  }

  finally {
    await session.endSession();
  }
});

// -------------------------------------------------------------------------- //

module.exports = router;
