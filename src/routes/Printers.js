const express = require('express');
const router = express.Router();

const Printer = require('../models/Printer');
const Shop = require('../models/Shop');

const { isAdmin, ownsShops } = require('../func/auth');
const { resp, validateObjectIds } = require('../func/misc');

// Allow admins (any shop) or the shop's owner. Expects req.params.shopId.
const adminOrOwner = async (req, res, next) => {
  const [admin, owner] = await Promise.all([
    isAdmin(req.token.uid),
    ownsShops(req.token.uid, req.params.shopId),
  ]);

  if (!admin && !owner) return resp(res, 403, 'forbidden');

  return next();
};

// -------------------------------------------------------------------------- //

// Admins only: every printer system wide.
router.get('/', isAdmin, async (req, res) => {
  const printers = await Printer.find({}).populate(Printer.printerPopulate);

  return resp(res, 200, 'fetched printers', { printers });
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owner: all printers for a shop, or a single printer.
//   GET /:shopId             -> every printer for the shop
//   GET /:shopId/:printerId  -> one specific printer
router.get('/:shopId{/:printerId}', validateObjectIds('shopId', 'printerId', { allowEmpty: true }), adminOrOwner, async (req, res) => {
  if (req.params.printerId) {
    const printer = await Printer.findOne({ _id: req.params.printerId, shop: req.params.shopId }).populate(Printer.printerPopulate);

    if (!printer) return resp(res, 404, 'not found');
    return resp(res, 200, 'fetched printer', { printer });
  }

  const printers = await Printer.find({ shop: req.params.shopId }).populate(Printer.printerPopulate);

  return resp(res, 200, 'fetched printers', { printers });
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owner: create a printer for a shop.
router.post('/:shopId', validateObjectIds('shopId'), adminOrOwner, async (req, res) => {
  const { name } = req.body || {};

  if (!name) return resp(res, 400, 'missing or invalid field(s) (name)');

  if (!await Shop.exists({ _id: req.params.shopId })) {
    return resp(res, 404, 'shop not found');
  }

  try {
    const printer = await Printer.create({
      name,
      shop: req.params.shopId,
    });
    await printer.populate(Printer.printerPopulate);

    return resp(res, 201, 'created printer', { printer });
  } catch (err) {
    if (err.code === 11000) return resp(res, 409, 'a printer with this name already exists');
    throw err;
  }
});

// -------------------------------------------------------------------------- //

// Admins only: update a printer's name.
router.put('/:shopId/:printerId', isAdmin, validateObjectIds('shopId', 'printerId'), async (req, res) => {
  const { name } = req.body || {};

  if (!name) return resp(res, 400, 'missing or invalid field(s) (name)');

  try {
    const printer = await Printer.findOneAndUpdate(
      { _id: req.params.printerId, shop: req.params.shopId },
      { name },
      { returnDocument: 'after', runValidators: true },
    ).populate(Printer.printerPopulate);

    if (!printer) return resp(res, 404, 'not found');

    return resp(res, 200, 'updated printer', { printer });
  } catch (err) {
    if (err.code === 11000) return resp(res, 409, 'a printer with this name already exists');
    throw err;
  }
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owner: toggle disabled state.
router.patch('/:shopId/:printerId/isDisabled', validateObjectIds('shopId', 'printerId'), adminOrOwner, async (req, res) => {
  const { isDisabled } = req.body || {};

  if (typeof isDisabled !== 'boolean') {
    return resp(res, 400, 'missing or invalid field(s) (isDisabled)');
  }

  const printer = await Printer.findOneAndUpdate(
    { _id: req.params.printerId, shop: req.params.shopId },
    { isDisabled },
    { returnDocument: 'after', runValidators: true },
  ).populate(Printer.printerPopulate);

  if (!printer) return resp(res, 404, 'not found');

  return resp(res, 200, 'updated printer', { printer });
});

// -------------------------------------------------------------------------- //

// Admins or the shop's owner: delete a printer.
router.delete('/:shopId/:printerId', validateObjectIds('shopId', 'printerId'), adminOrOwner, async (req, res) => {
  const printer = await Printer.findOneAndDelete({ _id: req.params.printerId, shop: req.params.shopId });

  if (!printer) return resp(res, 404, 'not found');

  // TODO: handle cascading behaviour (e.g. jobs/history tied to this printer)

  return resp(res, 200, 'deleted printer');
});

// -------------------------------------------------------------------------- //

module.exports = router;
