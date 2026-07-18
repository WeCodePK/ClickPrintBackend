const express = require('express');
const router = express.Router();

const History = require('../models/History');

const { resp, validateObjectIds } = require('../func/misc');
const { isAdmin, ownsShops } = require('../func/auth');

// -------------------------------------------------------------------------- //

router.get('/{:shopId}', validateObjectIds('shopId', { allowEmpty: true }), async (req, res) => {
  const { uid } = req.token;
  const { shopId } = req.params;

  let query;

  if (shopId) {
    if (!(await ownsShops(uid, shopId)) && !(await isAdmin(uid))) {
      return resp(res, 403, 'you do not own this shop');
    }

    query = { shop: shopId };
  }
  else if (await isAdmin(uid)) {
    query = {};
  }
  else {
    query = { createdBy: uid };
  }

  const history = await History.find(query).populate(History.historyPopulate);
  return resp(res, 200, 'fetched history', { history });
});

// -------------------------------------------------------------------------- //

module.exports = router;
