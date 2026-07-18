const express = require('express');
const router = express.Router();

const { resp } = require('../func/misc');
const { isAdmin } = require('../func/auth');

const History = require('../models/History');

// -------------------------------------------------------------------------- //

router.get('/', async (req, res) => {
  let query;

  if (!isAdmin(req.token.uid)) {
    query = (req.token.sid)
      ? { shop: req.token.sid }
      : { createdBy: req.token.uid };
  }

  const history = await History.find(query)
    .populate(History.historyPopulate);

  return resp(res, 200, 'fetched history', { history });
});

// -------------------------------------------------------------------------- //

module.exports = router;