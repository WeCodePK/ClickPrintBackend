const express = require('express');
const router = express.Router();

const Contact = require('../models/Contact');

const { jwtAuth, isAdmin } = require('../func/auth');
const { resp, sendViaNotifyBot } = require('../func/misc');

// -------------------------------------------------------------------------- //

// Public submission handler shared by every contact form type.
const submit = (type) => async (req, res) => {
  const contact = await Contact.create({
    type,
    fields: Contact.pickFields(type, req.body || {}),
  });

  sendViaNotifyBot({ message: Contact.formatMessage(contact) })
    .catch((err) => console.error('[ERROR] Failed to notify contact submission:', err));

  return resp(res, 201, 'submission received', { contact });
};

router.post('/form', submit('form'));
router.post('/register', submit('register'));

// -------------------------------------------------------------------------- //

router.get('/', jwtAuth, isAdmin, async (req, res) => {
  const { type } = req.query;

  if (type !== undefined && !Contact.types[type]) {
    return resp(res, 400, `type must be one of: ${Object.keys(Contact.types).join(', ')}`);
  }

  const contacts = await Contact
    .find(type ? { type } : {})
    .sort({ createdAt: -1 });

  return resp(res, 200, 'fetched all contact submissions', { contacts });
});

// -------------------------------------------------------------------------- //

module.exports = router;
