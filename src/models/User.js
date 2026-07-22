const mongoose = require('mongoose');
const { isValidPhoneNumber } = require('../func/misc');

const validateUserName = (v) => {
  if (v === '') return true;                                // optional, empty is fine
  if (!/^[\p{L}\p{N}\s.,'&()\-]+$/u.test(v)) return false;  // allowed chars only
  if (!/^\p{L}.*\p{L}$|^\p{L}$/u.test(v)) return false;     // start & end with a letter
  if (/([.,'&()\-])\1/.test(v)) return false;               // no repeated punctuation
  return true;
};

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    default: '',
    trim: true,
    set: (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v,
    maxlength: [50, 'Field `name` can not exceed 50 characters'],
    validate: {
      validator: validateUserName,
      message: 'Field `name` contains invalid characters or sequences',
    },
  },

  number: {
    type: String,
    required: [true, 'Field `number` is required'],
    unique: true,
    trim: true,
    validate: {
      validator: isValidPhoneNumber,
      message: 'Field `number` must be in 923XXXXXXXXX format',
    },
  },

  balance: {
    type: Number,
    required: [true, 'Field `balance` is required'],
    default: 0,
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 0,
      message: 'Field `balance` must be a non-negative whole number',
    },
  },

  isDisabled: {
    type: Boolean,
    default: false,
    required: [true, 'Field `isDisabled` is required'],
  },

}, { timestamps: false, versionKey: false, });

const User = mongoose.model('User', userSchema);

module.exports = User;