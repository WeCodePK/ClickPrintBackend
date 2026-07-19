const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const Shop = require('../models/Shop');
const Service = require('../models/Service');
const Printer = require('../models/Printer');

const { isAdmin, ownsShops } = require('../func/auth');
const { resp, validateObjectIds } = require('../func/misc');

// -------------------------------------------------------------------------- //

// Whether the caller may manage services for a given shop: system admins may
// touch any shop, otherwise the caller must own the shop in question.
const canManageShop = async (uid, shopId) => {
  if (await isAdmin(uid)) return true;
  return ownsShops(uid, shopId);
};

// Validates and normalizes the service body shared by create (POST) and
// update (PUT). Returns { error } with a client message, or { data } with the
// fields ready to write. `shop` is used to ensure referenced printers belong
// to that shop.
const buildServiceData = async (body, shop) => {
  const { rate, keys, printers } = body || {};

  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    return { error: 'missing or invalid field(s) (rate)' };
  }

  if (!keys || typeof keys !== 'object') {
    return { error: 'missing or invalid field(s) (keys)' };
  }

  const { color, pageType, sidedness } = keys;

  if (typeof color !== 'boolean') {
    return { error: 'missing or invalid field(s) (keys.color)' };
  }
  if (!pageType || typeof pageType !== 'string') {
    return { error: 'missing or invalid field(s) (keys.pageType)' };
  }
  if (typeof sidedness !== 'boolean') {
    return { error: 'missing or invalid field(s) (keys.sidedness)' };
  }

  if (!Array.isArray(printers) || printers.length === 0) {
    return { error: 'printers must be an array of 1 or more objects' };
  }

  const normalizedPrinters = [];

  for (const [index, entry] of printers.entries()) {
    if (!entry || typeof entry !== 'object') {
      return { error: `printers[${index}] must be an object` };
    }

    const { useAuto = false, printer } = entry;

    if (typeof useAuto !== 'boolean') {
      return { error: `printers[${index}].useAuto must be a boolean` };
    }

    if (!mongoose.isValidObjectId(printer)) {
      return { error: `printers[${index}].printer is not a valid id` };
    }

    if (!await Printer.exists({ _id: printer, shop })) {
      return { error: `printers[${index}].printer does not exist` };
    }

    normalizedPrinters.push({ useAuto, printer });
  }

  // Name is derived from the keys, never taken from the client:
  // <pageType>-<CL|BW>-<DS|SS>, e.g. { A4, color: false, sidedness: false } -> "A4-BW-SS".
  const name = `${pageType}-${color ? 'CL' : 'BW'}-${sidedness ? 'DS' : 'SS'}`;

  return {
    data: {
      name,
      rate,
      keys: { color, pageType, sidedness },
      printers: normalizedPrinters,
    },
  };
};

// Maps a Mongo duplicate-key (11000) error to a client message based on which
// unique index was violated. Returns null for any other error so the caller
// can rethrow it.
const duplicateMessage = (err) => {
  if (err.code !== 11000) return null;

  const keys = Object.keys(err.keyPattern || {});

  if (keys.includes('name')) {
    return 'a service with this name already exists';
  }
  if (keys.some((k) => k.startsWith('keys.'))) {
    return 'a service with these keys already exists';
  }

  return 'a service with these details already exists';
};

// -------------------------------------------------------------------------- //

// GET /api/services — admin only: every service across all shops.
router.get('/', isAdmin, async (req, res) => {
  const services = await Service.find({}).populate(Service.servicePopulate);
  return resp(res, 200, 'fetched services', { services });
});

// GET /api/services/:shopId — admin or shop owner: all services of one shop.
router.get('/:shopId', validateObjectIds('shopId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const services = await Service.find({ shop: req.params.shopId })
    .populate(Service.servicePopulate);

  return resp(res, 200, 'fetched services', { services });
});

// GET /api/services/:shopId/:serviceId — admin or shop owner: one service.
router.get('/:shopId/:serviceId', validateObjectIds('shopId', 'serviceId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const service = await Service.findOne({ _id: req.params.serviceId, shop: req.params.shopId })
    .populate(Service.servicePopulate);

  if (!service) return resp(res, 404, 'not found');

  return resp(res, 200, 'fetched service', { service });
});

// POST /api/services/:shopId — admin or shop owner: create a service.
router.post('/:shopId', validateObjectIds('shopId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  if (!await Shop.exists({ _id: req.params.shopId })) {
    return resp(res, 404, 'shop not found');
  }

  const { error, data } = await buildServiceData(req.body, req.params.shopId);
  if (error) return resp(res, 400, error);

  let service;
  try {
    service = await Service.create({ ...data, shop: req.params.shopId });
  } catch (err) {
    const message = duplicateMessage(err);
    if (message) return resp(res, 409, message);
    throw err;
  }

  await service.populate(Service.servicePopulate);

  return resp(res, 201, 'created service', { service });
});

// PUT /api/services/:shopId/:serviceId — admin or shop owner: replace a service.
router.put('/:shopId/:serviceId', validateObjectIds('shopId', 'serviceId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const { error, data } = await buildServiceData(req.body, req.params.shopId);
  if (error) return resp(res, 400, error);

  let service;
  try {
    service = await Service.findOneAndUpdate(
      { _id: req.params.serviceId, shop: req.params.shopId },
      data,
      { returnDocument: 'after', runValidators: true },
    ).populate(Service.servicePopulate);
  } catch (err) {
    const message = duplicateMessage(err);
    if (message) return resp(res, 409, message);
    throw err;
  }

  if (!service) return resp(res, 404, 'not found');

  return resp(res, 200, 'updated service', { service });
});

// PATCH /api/services/:shopId/:serviceId/isDisabled — admin or shop owner:
// toggle the service's disabled state.
router.patch('/:shopId/:serviceId/isDisabled', validateObjectIds('shopId', 'serviceId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const { isDisabled } = req.body || {};
  if (typeof isDisabled !== 'boolean') {
    return resp(res, 400, 'missing or invalid field(s) (isDisabled)');
  }

  const service = await Service.findOneAndUpdate(
    { _id: req.params.serviceId, shop: req.params.shopId },
    { isDisabled },
    { returnDocument: 'after', runValidators: true },
  ).populate(Service.servicePopulate);

  if (!service) return resp(res, 404, 'not found');

  return resp(res, 200, 'updated service', { service });
});

// DELETE /api/services/:shopId/:serviceId — admin or shop owner: delete a service.
router.delete('/:shopId/:serviceId', validateObjectIds('shopId', 'serviceId'), async (req, res) => {
  if (!await canManageShop(req.token.uid, req.params.shopId)) {
    return resp(res, 403, 'forbidden');
  }

  const service = await Service.findOneAndDelete({ _id: req.params.serviceId, shop: req.params.shopId });

  if (!service) return resp(res, 404, 'not found');

  return resp(res, 200, 'deleted service');
});

// -------------------------------------------------------------------------- //

module.exports = router;
