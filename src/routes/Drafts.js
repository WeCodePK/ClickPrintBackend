const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const File = require('../models/File');
const Shop = require('../models/Shop');
const Draft = require('../models/Draft');
const Service = require('../models/Service');

const { isAdmin } = require('../func/auth');
const { runSideEffects } = require('../func/jobs');
const { calculateJobCost } = require('../func/cost');
const { notifyShopOnJobsUpdate } = require('../func/sse');
const { resp, validateObjectIds } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.post('/', async (req, res) => {
  const { files, shop } = req.body || {};
  
  if (shop && validateObjectIds.check(shop) && !await Shop.exists({ _id: shop })) {
    return resp(res, 400, 'shop does not exist');
  }

  if (files) {
    if (!Array.isArray(files) || files.length === 0) {
      return resp(res, 400, 'files must be an array of 1 or more objects');
    }

    for (const [index, file] of files.entries()) {
      if (!file.file) {
        return resp(res, 400, `file does not exist`);
      }
      const record = await File.findById(file.file).select('type').lean();
      if (!record) {
        return resp(res, 400, `file does not exist`);
      }
      if (record.type !== 'pdf') {
        return resp(res, 400, `only pdf files are allowed`);
      }
    }
  }

  const draft = await Draft.create({
    files, shop,
    createdBy: req.token.uid,
  });

  await draft.populate(Draft.draftPopulate);
  return resp(res, 201, 'draft created', { draft });
});

// -------------------------------------------------------------------------- //

router.get('/{:draftId}', validateObjectIds('draftId', { allowEmpty: true }), async (req, res) => {
  const admin = await isAdmin(req.token.uid);

  if (req.params.draftId) {
    const draft = await Draft.findById(req.params.draftId).populate(Draft.draftPopulate);

    if (!draft) return resp(res, 404, 'not found');
    if (!admin && !draft.createdBy.equals(req.token.uid)) return resp(res, 403, 'forbidden');

    return resp(res, 200, 'fetched draft', {draft});
  }

  const filter = admin ? {} : { createdBy: req.token.uid };
  const drafts = await Draft.find(filter).populate(Draft.draftPopulate);
  return resp(res, 200, 'fetched all drafts', {drafts});
});

// -------------------------------------------------------------------------- //

router.put('/:draftId', validateObjectIds('draftId'), async (req, res) => {
  const { files, shop } = req.body || {};

  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!draft.createdBy.equals(req.token.uid)) return resp(res, 403, 'forbidden');

  if (shop !== undefined) {
    if (!shop) {
      return resp(res, 400, 'shop cannot be cleared');
    }

    if (!validateObjectIds.check(shop) || !await Shop.exists({ _id: shop })) {
      return resp(res, 400, 'shop does not exist');
    }

    draft.shop = shop;
  }

  if (files !== undefined) {
    if (!Array.isArray(files)) {
      return resp(res, 400, 'files must be an array');
    }

    for (const file of files) {
      if (!file.file) {
        return resp(res, 400, `file does not exist`);
      }
      const record = await File.findById(file.file).select('type').lean();
      if (!record) {
        return resp(res, 400, `file does not exist`);
      }
      if (record.type !== 'pdf') {
        return resp(res, 400, `only pdf files are allowed`);
      }
    }

    draft.files = files;
  }

  delete draft.cost;

  await draft.save();
  await draft.populate(Draft.draftPopulate);

  return resp(res, 200, 'draft updated', {draft});
});

// -------------------------------------------------------------------------- //

router.delete('/:draftId', validateObjectIds('draftId'), async (req, res) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!await isAdmin(req.token.uid) && !draft.createdBy.equals(req.token.uid)) {
    return resp(res, 403, 'forbidden');
  }

  await Draft.deleteOne(draft);
  return resp(res, 200, 'draft deleted');
});

// -------------------------------------------------------------------------- //

router.patch('/:draftId/check', validateObjectIds('draftId'), async (req, res, next) => {
  const draft = await Draft.findById(req.params.draftId);

  if (!draft) return resp(res, 404, 'not found');
  if (!draft.createdBy.equals(req.token.uid)) return resp(res, 403, 'forbidden');

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
  if (!draft.createdBy.equals(req.token.uid)) return resp(res, 403, 'forbidden');

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

      [job] = await Job.create([{
        ...draft.toObject(),
        status: 'submitted',
        statusHistory: [{ by: 'user', status: 'submitted' }]
      }], { session });

      await runSideEffects('submitted', job, session);
    });

    notifyShopOnJobsUpdate(job.shop.toString());

    await job.populate(Job.jobPopulate);
    return resp(res, 200, 'job created', {job});
  }

  catch (err) {
    if (/insufficient balance/i.test(err.message)) {
      return resp(res, 402, 'insufficient balance');
    }
    return next(err);
  }

  finally {
    await session.endSession();
  }
});

// -------------------------------------------------------------------------- //

module.exports = router;