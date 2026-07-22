const express = require('express');
const router = express.Router();

const User = require('../models/User');

const { isAdmin } = require('../func/auth');
const { resp, validateObjectIds, isValidPhoneNumber } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.post('/', isAdmin, async (req, res) => {
  const { name, number } = req.body || {};

  const user = await User.create({ name, number });

  return resp(res, 201, 'Created user', { user });
});

// -------------------------------------------------------------------------- //

router.get('/{:userId}', validateObjectIds('userId', { allowEmpty: true }), async (req, res) => {
  const { userId } = req.params;
  const isAdm = await isAdmin(req.token.uid);

  if (userId) {
    if (!isAdm && userId !== req.token.uid) {
      return resp(res, 403, 'You can not view other users');
    }

    const user = await User.findById(userId);

    if (!user) return resp(res, 404, 'User does not exist');
    return resp(res, 200, 'Fetched user', { user });
  }

  if (!isAdm) return resp(res, 403, 'You are not an admin');

  const users = await User.find();
  return resp(res, 200, 'Fetched all users', { users });
});

// -------------------------------------------------------------------------- //

router.put('/:userId', validateObjectIds('userId'), async (req, res) => {
  const isAdm = isAdmin(req.token.uid);
  const isSelf = req.params.userId === req.token.uid;

  if (!isAdm && !isSelf) return resp(res, 403, 'forbidden');

  const allowed = isAdm ? ['name', 'number'] : ['name'];

  const body = req.body || {};
  const updates = {};
  for (const field of allowed) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (updates.number !== undefined && !isValidPhoneNumber(updates.number)) {
    return resp(res, 400, `field 'number' is not in valid E164 format (without the +)`);
  }

  try {
    const user = await User.findByIdAndUpdate(req.params.userId, updates, {
      returnDocument: 'after', runValidators: true
    });

    if (!user) return resp(res, 404, 'not found');
    return resp(res, 200, 'updated user', { user });
  } catch (err) {
    if (err.code === 11000) return resp(res, 409, 'a user with this number already exists');
    throw err;
  }
});

// -------------------------------------------------------------------------- //

router.patch('/:userId/isDisabled', isAdmin, validateObjectIds('userId'), async (req, res) => {
  const { isDisabled } = req.body || {};

  if (typeof isDisabled !== 'boolean') {
    return resp(res, 400, 'missing or invalid field(s) (isDisabled)');
  }

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { isDisabled },
    { returnDocument: 'after' }
  );

  if (!user) return resp(res, 404, 'not found');
  return resp(res, 200, `user ${isDisabled ? 'disabled' : 'enabled'}`, { user });
});

// -------------------------------------------------------------------------- //

router.delete('/:userId', isAdmin, validateObjectIds('userId'), async (req, res) => {
  return resp(res, 501, 'not implemented yet');
});

// -------------------------------------------------------------------------- //

module.exports = router;