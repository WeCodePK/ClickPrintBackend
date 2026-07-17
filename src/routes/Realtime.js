const express = require('express');
const router = express.Router();

const { resp } = require('../func/misc');
const { sseClients } = require('../func/sse');

const Shop = require('../models/Shop');
(async () => await Shop.updateMany({}, { $set: { isOnline: false } }))();

// -------------------------------------------------------------------------- //

router.get('/events', async (req, res) => {
  if (!req.token.sid) return resp(res, 403, 'forbidden');

  sseClients.set(req.token.sid, res);

  res.set({
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
  });

  res.flushHeaders();
  res.write(`event: connected\ndata: \n\n`);

  const ping = setInterval(async () => {
    const shop = await Shop.findById(req.token.sid);

    if (shop.lastSeen < (Date.now() - 10000)) {
      shop.isOnline = false;
      await shop.save();
    };

    res.write('event: ping\ndata: \n\n');
  }, 5000);

  req.on('close', async () => {
    clearInterval(ping);
    sseClients.delete(req.token.sid);
    await Shop.findByIdAndUpdate(req.token.sid, { isOnline: false });
  });
});

router.patch('/status/:shopId', validateObjectIds('shopId'), async (req, res) => {
  if (!req.token.sid || req.token.sid !== req.params.shopId) return resp(res, 403, 'forbidden');
  if (!sseClients.get(req.token.sid)) return resp(res, 400, 'shop must be connected to sse to update');

  const shop = await Shop.findByIdAndUpdate(
    req.params.shopId,
    { isOnline: true, lastSeen: new Date() },
    { returnDocument: 'after' }
  );

  if (!shop) return resp(res, 404, 'not found');
  return resp(res, 200, 'isOnline updated', { shop });
});

// -------------------------------------------------------------------------- //

module.exports = router;
