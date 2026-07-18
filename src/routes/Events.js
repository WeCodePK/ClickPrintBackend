const express = require('express');
const router = express.Router();

const { ownsShops } = require('../func/auth');
const { sseClients } = require('../func/sse');

// -------------------------------------------------------------------------- //

router.get('/events/:shopId', ownsShops, async (req, res) => {
  const { shopId } = req.params;

  sseClients.set(shopId, res);

  res.set({
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
  });

  res.flushHeaders();
  res.write(`event: connected\ndata: \n\n`);

  const ping = setInterval(async () => {
    res.write('event: ping\ndata: \n\n');
  }, 5000);

  req.on('close', async () => {
    clearInterval(ping);
    sseClients.delete(shopId);
  });
});

// -------------------------------------------------------------------------- //

module.exports = router;
