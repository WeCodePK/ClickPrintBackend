const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const File = require('../models/File');
const Shop = require('../models/Shop');

const { isAdmin, ownsShops } = require('../func/auth');
const { notifyUserOnJobStatus } = require('../func/push');
const { resp, validateObjectIds } = require('../func/misc');
const { sseClients, notifyShopOnJobsUpdate } = require('../func/sse');
const { validateTransition, runSideEffects } = require('../func/jobs');

// -------------------------------------------------------------------------- //

// GET /api/jobs lists every job (admins only); GET /api/jobs/user/:userId
// lists one user's jobs (that user, or an admin on their behalf).
router.get(['/', '/user/:userId'], validateObjectIds('userId', { allowEmpty: true }), async (req, res) => {
  const { userId } = req.params;
  const admin = await isAdmin(req.token.uid);

  if (!admin && (!userId || userId !== req.token.uid)) {
    return resp(res, 403, 'forbidden');
  }

  const filter = userId ? { createdBy: userId } : {};
  const jobs = await Job
    .find(filter)
    .populate(Job.jobPopulate)
    .sort({ createdAt: 1 });

  return resp(res, 200, 'fetched jobs', {jobs});
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owner: every job for a given shop.
router.get('/shop/:shopId', validateObjectIds('shopId'), async (req, res) => {
  const isAdm = await isAdmin(req.token.uid);
  const isOwner = await ownsShops(req.token.uid, req.params.shopId);

  if (!isAdm && !isOwner) return resp(res, 403, 'forbidden');

  const jobs = await Job
    .find({ shop: req.params.shopId })
    .populate(Job.jobPopulate)
    .sort({ createdAt: 1 });

  return resp(res, 200, 'fetched all jobs', {jobs});
});

// -------------------------------------------------------------------------- //

// A single job: visible to an admin, its creator, or the owner of its shop.
router.get('/:jobId', validateObjectIds('jobId'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) return resp(res, 404, 'not found');

  const isAdm = await isAdmin(req.token.uid);
  const isCreator = job.createdBy.equals(req.token.uid);
  const isOwner = await ownsShops(req.token.uid, job.shop);

  if (!isAdm && !isCreator && !isOwner) return resp(res, 404, 'not found');

  await job.populate(Job.jobPopulate);
  return resp(res, 200, 'fetched job', {job});
});

// -------------------------------------------------------------------------- //

router.patch('/:jobId/status', validateObjectIds('jobId'), async (req, res, next) => {
  const { jobId } = req.params;
  const { status: nextStatus } = req.body;

  if (!nextStatus) {
    return resp(res, 400, 'missing or invalid fields (status)');
  }

  try {
    const job = await Job.findById(jobId);
    if (!job) return resp(res, 404, 'not found');

    const isCreator = job.createdBy.equals(req.token.uid);
    const isOwner = await ownsShops(req.token.uid, job.shop);

    if (!isCreator && !isOwner) return resp(res, 403, 'forbidden');

    // A shop owner takes precedence when the same identity is also the
    // job's creator (e.g. an owner test-ordering at their own shop).
    const roles = [isOwner && 'shop', isCreator && 'user'].filter(Boolean);

    let role;
    let check;
    for (role of roles) {
      check = validateTransition(job.status, nextStatus, role);
      if (check.ok) break;
    }
    if (!check.ok) return resp(res, check.code, check.message);

    job.status = nextStatus;
    job.statusHistory.push({ status: nextStatus, by: role, at: new Date() });

    await job.save();
    await runSideEffects(nextStatus, job);

    // await notifyUserOnJobStatus(job);
    notifyShopOnJobsUpdate(job.shop.toString());

    await job.populate(Job.jobPopulate);
    return resp(res, 200, 'job status updated', {job});
  }
  
  catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------------- //

module.exports = router;