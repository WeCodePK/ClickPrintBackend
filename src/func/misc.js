const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { randomInt } = require('crypto');

exports.resp = (res, code, message, data = {}) => {
  return res.status(code).json({
    success: (code >= 200 && code <= 299),
    message,
    data
  })
};

exports.isValidPhoneNumber = (number) => {
  return typeof number === 'string' && /^923\d{9}$/.test(number);
};

exports.validateObjectIds = (...args) => (req, res, next) => {
  let options = {};
  let params = args;

  const last = args[args.length - 1];
  if (typeof last === 'object' && last !== null) {
    options = last;
    params = args.slice(0, -1);
  }

  const { allowEmpty = false } = options;

  for (const param of params) {
    const value = req.params[param];

    if (allowEmpty && !value) {
      continue;
    }

    if (!mongoose.isValidObjectId(value)) {
      return exports.resp(res, 400, `Invalid ObjectId for '${param}'`);
    }
  }

  next();
};

// Standalone counterpart to the validateObjectIds middleware: validate raw
// id values directly. Returns true only if every supplied value is a valid
// ObjectId. Call with one id or several — validateObjectIds.check(a, b, c).
exports.validateObjectIds.check = (...ids) => {
  if (ids.length === 0) return false;
  return ids.every((id) => mongoose.isValidObjectId(id));
};

exports.sendViaSms = async (number, message) => {
  const url = new URL(process.env.SMSGATE_URL);
  return await fetch(`${url.origin}${url.pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: "Basic " + Buffer.from(`${url?.username}:${url?.password}`).toString("base64"),
    },
    body: JSON.stringify({
      textMessage: { text: message },
      phoneNumbers: [ `+${number}` ],
    })
  });
};