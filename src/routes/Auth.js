const { randomInt } = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();

const Otp = require('../models/Otp');
const User = require('../models/User');

const { keyAuth, ownsShops, isAdmin } = require('../func/auth');
const { resp, sendViaSms, isValidPhoneNumber } = require('../func/misc');

// -------------------------------------------------------------------------- //

const OTP_LENGTH = 5;
const OTP_MAX_TRIES = 3;
const JWT_EXPIRES_IN = '30d';
const OTP_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

function generateOtpCode(length) {
  let otp = `${randomInt(1, 10)}`;
  for (let i = 1; i < length; i++)
    otp += randomInt(0, 10);
  return otp;
}

// -------------------------------------------------------------------------- //

router.post('/otp', async (req, res) => {
  const { number, intent } = req.body || {};

  if (!number) return resp(res, 400, `missing or empty field 'number'`);
  if (!isValidPhoneNumber(number)) return resp(res, 400, `field 'number' is not in valid E164 format (without the +)`);
  if (!intent) return resp(res, 400, `missing or empty field 'intent'`);
  if (!['user', 'shop', 'admin'].includes(intent)) {
    return resp(res, 400, `field 'intent' must be one of 'user', 'shop', 'admin'`);
  }

  // Rate-limit: check the existing OTP's lastSentAt independently of its expiry
  const existing = await Otp.findOne({ number }).lean();
  if (existing && Date.now() - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return resp(res, 429, 'too many requests');
  }

  // For non-user intents, verify authorization up front so we don't send an OTP
  // to someone who can't log in as a shop/admin anyway.
  if (intent === 'shop' || intent === 'admin') {
    const user = await User.findOne({ number });
    if (!user) {
      return resp(res, 404, 'user does not exist');
    }

    if (intent === 'shop') {
      const shops = await ownsShops(user._id);
      if (shops.length === 0) {
        return resp(res, 403, 'user does not own any shops');
      }
    } else {
      if (!(await isAdmin(user._id))) {
        return resp(res, 403, 'user is not an admin');
      }
    }
  }

  const now = new Date();
  const code = generateOtpCode(OTP_LENGTH);

  // Upsert: overwrite any existing OTP for this number with a fresh one
  await Otp.findOneAndUpdate(
    { number },
    {
      code,
      number,
      tries: OTP_MAX_TRIES,
      expiry: new Date(now.getTime() + OTP_VALIDITY_MS),
      lastSentAt: now,
    },
    { upsert: true, returnDocument: 'after' }
  );

  await sendViaSms(number, `[ClickPrint] Your login OTP is: ${code}`);
  return resp(res, 200, 'otp sent');
});

// -------------------------------------------------------------------------- //

router.post('/verify', async (req, res) => {
  const { code, number } = req.body || {};

  if (!code || !number) {
    return resp(res, 400, 'missing or empty fields (code, number)');
  }

  const otp = await Otp.findOne({ number });

  if (!otp) return resp(res, 401, 'Invalid or expired OTP.');

  // Explicit expiry check — don't rely on Mongo's TTL sweep
  if (otp.expiry.getTime() <= Date.now()) {
    await Otp.deleteOne({ _id: otp._id });
    return resp(res, 401, 'Invalid or expired OTP.');
  }

  if (otp.tries <= 0) return resp(res, 429, 'Too many requests. Try again later.');

  if (otp.code !== code) {
    otp.tries -= 1;
    await otp.save();
    return resp(res, 401, 'Invalid or expired OTP.');
  }

  await Otp.deleteOne({ _id: otp._id });

  const user = await User.findOneAndUpdate(
    { number },
    { $setOnInsert: { number } },
    { upsert: true, returnDocument: 'after' }
  );

  const shops = await ownsShops(user._id);

  const token = jwt.sign(
    { uid: user._id },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return resp(res, 200, 'otp verified', { user, shops, token });
});

// -------------------------------------------------------------------------- //

router.post('/mint', keyAuth, async (req, res) => {
  const { number } = req.body || {};

  if (!number) return resp(res, 400, 'number is required');
  if (!isValidPhoneNumber(number)) return resp(res, 400, `number must be in 92XXXXXXXXXX format`);

  const user = await User.findOneAndUpdate(
    { number },
    { $setOnInsert: { number } },
    { upsert: true, returnDocument: 'after' }
  );

  const token = jwt.sign(
    { uid: user._id },
    process.env.JWT_SECRET
  );

  return resp(res, 200, 'minted token', { token });
});

// -------------------------------------------------------------------------- //

module.exports = router;