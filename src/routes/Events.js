const express = require('express');
const router = express.Router();

const { resp } = require('../func/misc');
const { sseClients } = require('../func/sse');

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
    res.write('event: ping\ndata: \n\n');
  }, 5000);

  req.on('close', async () => {
    clearInterval(ping);
    sseClients.delete(req.token.sid);
  });
});

// -------------------------------------------------------------------------- //

module.exports = router;
