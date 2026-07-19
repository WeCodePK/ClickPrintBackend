const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Admin = require('../models/Admin');
const Shop = require('../models/Shop');
const Topup = require('../models/Topup');
const Draft = require('../models/Draft');
const Job = require('../models/Job');
const History = require('../models/History');

const { resp } = require('../func/misc');
const { isAdmin } = require('../func/auth');

// -------------------------------------------------------------------------- //

router.get('/drafts', isAdmin, async (req, res) => {
  // A priced draft (has cost) is "ready" regardless of its other fields, so it
  // takes precedence. Among the rest, "complete" needs a shop, at least one
  // file, and settings on every file; "incomplete" is whatever is missing one of
  // those. The buckets are mutually exclusive, so they partition the drafts and
  // "incomplete" is derived as the remainder to keep the parts summing to total.
  const priced = { cost: { $exists: true } };

  const complete = {
    cost: { $exists: false },
    shop: { $exists: true, $ne: null },
    'files.0': { $exists: true },
    files: { $not: { $elemMatch: { settings: { $exists: false } } } },
  };

  const [ drafts, ready, completeCount ] = await Promise.all([
    Draft.countDocuments(),
    Draft.countDocuments(priced),
    Draft.countDocuments(complete),
  ]);

  const incomplete = drafts - ready - completeCount;

  return resp(res, 200, 'fetched draft stats', {
    stats: {
      drafts,
      ready,
      complete: completeCount,
      incomplete,
    },
  });
});

router.get('/jobs', isAdmin, async (req, res) => {
  // A job in this collection always has one of these three statuses; the
  // terminal states (cancelled/completed/failed) only exist once a job is moved
  // to the history collection. So the buckets partition the jobs and sum to the
  // total.
  const [ jobs, printing, queued, submitted ] = await Promise.all([
    Job.countDocuments(),
    Job.countDocuments({ status: 'printing' }),
    Job.countDocuments({ status: 'queued' }),
    Job.countDocuments({ status: 'submitted' }),
  ]);

  return resp(res, 200, 'fetched job stats', { stats: { jobs, printing, queued, submitted } });
});

router.get('/history', isAdmin, async (req, res) => {
  // A job only reaches the history collection once it hits a terminal state, so
  // every history entry is one of these three. The buckets partition the history
  // and always sum to the total.
  const [ jobs, cancelled, failed, completed ] = await Promise.all([
    History.countDocuments(),
    History.countDocuments({ status: 'cancelled' }),
    History.countDocuments({ status: 'failed' }),
    History.countDocuments({ status: 'completed' }),
  ]);

  return resp(res, 200, 'fetched history stats', { stats: { jobs, cancelled, failed, completed } });
});

router.get('/shops', isAdmin, async (req, res) => {
  // Disabled shops are their own bucket rather than being folded into offline,
  // so isOnline is only ever read for shops that are enabled. The three buckets
  // partition the shops and always sum to the total.
  const [ shops, online, offline, disabled ] = await Promise.all([
    Shop.countDocuments(),
    Shop.countDocuments({ isDisabled: false, isOnline: true }),
    Shop.countDocuments({ isDisabled: false, isOnline: false }),
    Shop.countDocuments({ isDisabled: true }),
  ]);

  return resp(res, 200, 'fetched shop stats', { stats: { shops, online, offline, disabled } });
});

router.get('/topups', isAdmin, async (req, res) => {
  // The status enum has exactly these three values, so the buckets partition the
  // topups and always sum to the total.
  const [ topups, approved, declined, pending ] = await Promise.all([
    Topup.countDocuments(),
    Topup.countDocuments({ status: 'approved' }),
    Topup.countDocuments({ status: 'declined' }),
    Topup.countDocuments({ status: 'pending' }),
  ]);

  return resp(res, 200, 'fetched topup stats', { stats: { topups, approved, declined, pending } });
});

router.get('/users', isAdmin, async (req, res) => {
  // distinct() flattens array fields, so this holds if a shop gains many owners.
  const [ adminIds, ownerIds ] = await Promise.all([
    Admin.distinct('user'),
    Shop.distinct('owner'),
  ]);

  // The buckets partition the users, so admins take precedence over owners and
  // every count is read off User itself. That keeps the parts summing to the
  // total regardless of who holds both roles.
  const [ users, admins, owners, appUsers ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ _id: { $in: adminIds } }),
    User.countDocuments({ _id: { $in: ownerIds, $nin: adminIds } }),
    User.countDocuments({ _id: { $nin: [ ...adminIds, ...ownerIds ] } }),
  ]);

  return resp(res, 200, 'fetched user stats', { stats: { users, admins, owners, appUsers } });
});

// -------------------------------------------------------------------------- //

module.exports = router;