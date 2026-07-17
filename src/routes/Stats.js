const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Admin = require('../models/Admin');
const Shop = require('../models/Shop');
const Topup = require('../models/Topup');

const { resp } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.get('/shops', async (req, res) => {
  if (!req.token.isAdmin) return resp(res, 403, 'forbidden');

  // Disabled shops are their own bucket rather than being folded into offline,
  // so isOnline is only ever read for shops that are enabled. The three buckets
  // partition the shops and always sum to the total.
  const [ shops, online, offline, disabled ] = await Promise.all([
    Shop.countDocuments(),
    Shop.countDocuments({ isDisabled: false, isOnline: true }),
    Shop.countDocuments({ isDisabled: false, isOnline: false }),
    Shop.countDocuments({ isDisabled: true }),
  ]);

  return resp(res, 200, 'fetched shop stats', { shops, online, offline, disabled });
});

router.get('/topups', async (req, res) => {
  if (!req.token.isAdmin) return resp(res, 403, 'forbidden');

  // The status enum has exactly these three values, so the buckets partition the
  // topups and always sum to the total.
  const [ topups, approved, declined, pending ] = await Promise.all([
    Topup.countDocuments(),
    Topup.countDocuments({ status: 'approved' }),
    Topup.countDocuments({ status: 'declined' }),
    Topup.countDocuments({ status: 'pending' }),
  ]);

  return resp(res, 200, 'fetched topup stats', { topups, approved, declined, pending });
});

router.get('/users', async (req, res) => {
  if (!req.token.isAdmin) return resp(res, 403, 'forbidden');

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

  return resp(res, 200, 'fetched user stats', { users, admins, owners, appUsers });
});

// -------------------------------------------------------------------------- //

module.exports = router;