const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const File = require('../models/File');
const Shop = require('../models/Shop');

const { isAdmin } = require('../func/auth');
const { notifyUserOnJobStatus } = require('../func/push');
const { resp, validateObjectIds } = require('../func/misc');
const { sseClients, notifyShopOnJobsUpdate } = require('../func/sse');
const { validateTransition, runSideEffects } = require('../func/jobs');

// -------------------------------------------------------------------------- //

router.get('/{:jobId}', validateObjectIds('jobId', { allowEmpty: true }), async (req, res) => {
  let query;
  if (!isAdmin(req.token.uid)) {
    query = (req.token.sid) ? { shop: req.token.sid } : { createdBy: req.token.uid };
  }

  if (req.params.jobId) {
    const job = await Job
      .findOne({ _id: req.params.jobId, ...query })
      .populate(Job.jobPopulate);

    if (!job) return resp(res, 404, 'not found');
    return resp(res, 200, 'fetched job', {job});
  }

  const jobs = await Job
    .find(query)
    .populate(Job.jobPopulate)
    .sort({ createdAt: 1 });

  return resp(res, 200, 'fetched all jobs', {jobs});
});

router.patch('/:jobId/status', validateObjectIds('jobId'), async (req, res, next) => {
  const { jobId } = req.params;
  const { status: nextStatus } = req.body;
  const role = (req.token.sid) ? 'shop' : 'user';

  if (!nextStatus) {
    return resp(res, 400, 'missing or invalid fields (status)');
  }

  try {
    const job = await Job.findById(jobId);
    if (!job) return resp(res, 404, 'not found');

    if (role === 'shop' && !job.shop.equals(req.token.sid)) return resp(res, 403, 'forbidden');
    if (role === 'user' && !job.createdBy.equals(req.token.uid)) return resp(res, 403, 'forbidden');

    const check = validateTransition(job.status, nextStatus, role);
    if (!check.ok) return resp(res, check.code, check.message);

    job.status = nextStatus;
    job.statusHistory.push({ status: nextStatus, by: role, at: new Date() });

    await job.save();
    await runSideEffects(nextStatus, job);

    await notifyUserOnJobStatus(job);
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