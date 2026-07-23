const express = require('express');
const router = express.Router();

const Topup = require('../models/Topup');
const File = require('../models/File');
const User = require('../models/User');

const { isAdmin } = require('../func/auth');
const { resp, validateObjectIds } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.post('/', async (req, res) => {
  const { amount, paymentProofFile } = req.body || {};

  if (!Number.isInteger(amount) || amount < 10 || amount % 10 !== 0) {
    return resp(res, 400, 'amount must be an integer of at least 10 in multiples of 10');
  }

  if (!paymentProofFile) {
    return resp(res, 400, 'missing or invalid fields (paymentProofFile)');
  }

  if (!await File.exists({ _id: paymentProofFile })) {
    return resp(res, 400, 'file does not exist');
  }

  const topup = await Topup.create({
    status: 'pending',
    amount,
    paymentProofFile,
    createdBy: req.token.uid,
  });

  await topup.populate(Topup.filePopulate);
  return resp(res, 201, 'topup created', { topup });
});

// -------------------------------------------------------------------------- //

router.get('/{:topupId}', validateObjectIds('topupId', { allowEmpty: true }), async (req, res) => {
  let query = {};
  if (!(await isAdmin(req.token.uid))) query = { createdBy: req.token.uid };

  if (req.params.topupId) {
    const topup = await Topup
      .findOne({ _id: req.params.topupId, ...query })
      .populate(Topup.filePopulate);

    if (!topup) return resp(res, 404, 'not found');
    return resp(res, 200, 'fetched topup', {topup});
  }

  const topups = await Topup
    .find(query)
    .populate(Topup.filePopulate)
    .sort({ createdAt: -1 });

  return resp(res, 200, 'fetched all topups', {topups});
});

// -------------------------------------------------------------------------- //

router.patch('/:topupId', isAdmin, validateObjectIds('topupId'), async (req, res) => {
  const { status } = req.body || {};

  if (status !== 'approved' && status !== 'declined') {
    return resp(res, 400, 'status must be either approved or declined');
  }

  // Atomically claim the topup only if it is still pending, so two concurrent
  // approvals can't credit the wallet twice.
  const topup = await Topup.findOneAndUpdate(
    { _id: req.params.topupId, status: 'pending' },
    { status },
    { returnDocument: 'after' }
  );

  if (!topup) {
    // Either it doesn't exist or it was already resolved.
    if (!await Topup.exists({ _id: req.params.topupId })) {
      return resp(res, 404, 'not found');
    }
    return resp(res, 409, 'topup is not pending');
  }

  if (status === 'approved') {
    await User.updateOne(
      { _id: topup.createdBy },
      { $inc: { balance: topup.amount } }
    );
  }

  await topup.populate(Topup.filePopulate);
  return resp(res, 200, `topup ${status}`, { topup });
});

// -------------------------------------------------------------------------- //

module.exports = router;