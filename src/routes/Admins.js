const express = require('express');
const router = express.Router();

const Admin = require('../models/Admin');
const User = require('../models/User');

const { isAdmin } = require('../func/auth');
const { resp, validateObjectIds } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.get('/', isAdmin, async (req, res) => {
  const admins = await Admin
    .find()
    .populate(Admin.adminPopulate)
    .sort({ appointedAt: -1 });

  return resp(res, 200, 'fetched all admins', { admins });
});

// -------------------------------------------------------------------------- //

router.post('/', isAdmin, async (req, res) => {
  const { user } = req.body || {};

  if (!user) return resp(res, 400, 'missing or invalid field(s) (user)');
  if (!validateObjectIds.check(user)) {
    return resp(res, 400, `field 'user' is not a valid ObjectId`);
  }

  if (!await User.exists({ _id: user })) {
    return resp(res, 404, 'user does not exist');
  }

  try {
    let admin = await Admin.create({ _id: user, appointedBy: req.token.uid });
    admin = await admin.populate(Admin.adminPopulate);
    return resp(res, 201, 'admin appointed', { admin });
  } catch (err) {
    if (err.code === 11000) return resp(res, 409, 'this user is already an admin');
    throw err;
  }
});

// -------------------------------------------------------------------------- //

router.delete('/:userId', isAdmin, validateObjectIds('userId'), async (req, res) => {
  // Guard against an admin removing themselves and risking a lockout.
  if (req.params.userId === req.token.uid) {
    return resp(res, 400, 'you cannot remove yourself as an admin');
  }

  const admin = await Admin.findByIdAndDelete(req.params.userId);

  if (!admin) return resp(res, 404, 'not found');
  return resp(res, 200, 'admin removed', { admin });
});

// -------------------------------------------------------------------------- //

module.exports = router;
