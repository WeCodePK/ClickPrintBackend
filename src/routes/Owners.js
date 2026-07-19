const express = require('express');
const router = express.Router();

const Owner = require('../models/Owner');
const Shop = require('../models/Shop');
const User = require('../models/User');

const { isAdmin, ownsShops } = require('../func/auth');
const { resp, validateObjectIds } = require('../func/misc');

// -------------------------------------------------------------------------- //

router.get('/', isAdmin, async (req, res) => {
  const owners = await Owner
    .find()
    .select('-_id')
    .populate(Owner.ownerPopulate)
    .sort({ appointedAt: -1 });

  return resp(res, 200, 'fetched all owners', { owners });
});

// -------------------------------------------------------------------------- //

router.get('/:shopId', validateObjectIds('shopId'), async (req, res) => {
  const { uid } = req.token;
  const { shopId } = req.params;

  if (!await isAdmin(uid) && !await ownsShops(uid, shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const owners = await Owner
    .find({ shop: shopId })
    .select('-_id')
    .populate(Owner.ownerPopulate)
    .sort({ appointedAt: -1 });

  return resp(res, 200, 'fetched shop owners', { owners });
});

// -------------------------------------------------------------------------- //

router.post('/:shopId', validateObjectIds('shopId'), async (req, res) => {
  const { uid } = req.token;
  const { shopId } = req.params;

  const admin = await isAdmin(uid);
  if (!admin && !await ownsShops(uid, shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const { user } = req.body || {};

  if (!user) return resp(res, 400, 'missing or invalid field(s) (user)');
  if (!validateObjectIds.check(user)) {
    return resp(res, 400, `field 'user' is not a valid ObjectId`);
  }

  if (!await Shop.exists({ _id: shopId })) {
    return resp(res, 404, 'shop does not exist');
  }

  if (!await User.exists({ _id: user })) {
    return resp(res, 404, 'user does not exist');
  }

  try {
    let owner = await Owner.create({
      user,
      shop: shopId,
      appointedBy: uid,
      appointedByAdmin: admin,
    });
    owner = await owner.populate(Owner.ownerPopulate);
    return resp(res, 201, 'owner appointed', { owner });
  } catch (err) {
    if (err.code === 11000) return resp(res, 409, 'this user is already an owner of this shop');
    throw err;
  }
});

// -------------------------------------------------------------------------- //

router.delete('/:shopId/:userId', validateObjectIds('shopId', 'userId'), async (req, res) => {
  const { uid } = req.token;
  const { shopId, userId } = req.params;

  const admin = await isAdmin(uid);
  if (!admin && !await ownsShops(uid, shopId)) {
    return resp(res, 403, 'forbidden');
  }

  // Guard against a shop owner removing themselves and risking a lockout.
  // Admins are exempt and may remove any owner, including themselves.
  if (!admin && userId === uid) {
    return resp(res, 400, 'you cannot remove yourself as an owner');
  }

  const owner = await Owner.findOne({ shop: shopId, user: userId });
  if (!owner) return resp(res, 404, 'not found');

  // Shop owners may not remove an owner that an admin appointed.
  if (!admin && owner.appointedByAdmin) {
    return resp(res, 403, 'this owner was appointed by an admin and cannot be removed');
  }

  await owner.deleteOne();

  await owner.populate(Owner.ownerPopulate);
  return resp(res, 200, 'owner removed', { owner });
});

// -------------------------------------------------------------------------- //

module.exports = router;
