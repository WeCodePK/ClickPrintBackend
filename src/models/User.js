const mongoose = require('mongoose');
const { isValidPhoneNumber } = require('../func/misc');

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    default: '',
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
    match: [/^[\p{L}\p{N}\s.,'&()\-]*$/u, 'Name contains invalid characters'],
  },

  number: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    validate: {
      validator: isValidPhoneNumber,
      message: 'Phone number must be in 92XXXXXXXXXX format (e.g. 923001234567)',
    },
  },

  isDisabled: {
    type: Boolean,
    required: true,
    default: false,
  },

}, { timestamps: false, versionKey: false, });

const User = mongoose.model('User', userSchema);

module.exports = User;