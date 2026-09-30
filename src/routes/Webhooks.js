const express = require('express');
const router = express.Router();

const { resp } = require('../func/misc');
const { ownsShops } = require('../func/auth');
const { isConfigured, parseContext, allowRequest, infer } = require('../func/inference');

// -------------------------------------------------------------------------- //

// Shop owners only: reads a WhatsApp customer's message about their order and
// returns structured print settings (see func/inference.js). The desktop app
// calls this for its "AI chat" ordering flow.
router.post('/inference', async (req, res) => {
  if (!isConfigured()) return resp(res, 503, 'inference not configured');

  const { context, error } = parseContext(req.body);
  if (error) return resp(res, 400, error);

  if (!await ownsShops(req.token.uid, context.shop)) {
    return resp(res, 403, 'you do not own this shop');
  }

  if (!allowRequest(context.shop)) {
    return resp(res, 429, 'too many requests, try again later');
  }

  try {
    const result = await infer(context);
    return resp(res, 200, 'inference complete', { result });
  }
  catch (err) {
    console.error('[ERROR] Inference failed:', err.message);
    return resp(res, 502, 'inference failed');
  }
});

// -------------------------------------------------------------------------- //

module.exports = router;
