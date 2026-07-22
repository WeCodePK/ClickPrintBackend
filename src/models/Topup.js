const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({

  status: {
    type: String,
    required: true,
    default: 'pending',
    enum: {
      values: ['pending', 'approved', 'declined'],
      message: '`{VALUE}` is not a valid value for field `status`',
    },
  },

  amount: {
    type: Number,
    required: [true, 'Field `amount` is required'],
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 10 && v <= 1000 && v % 10 === 0,
      message: 'Field `amount` must be a whole number, a multiple of 10, between 10 and 1000',
    },
  },

  paymentProofFile: {
    ref: 'File',
    trim: true,
    type: String,
    required: [true, 'Field `paymentProofFile` is required'],
  },

  createdBy: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `createdBy` is required'],
  },

  createdAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `createdAt` can not be in the future',
    },
  },

}, { timestamps: false, versionKey: false, });

const Topup = mongoose.model('Topup', topupSchema);

Topup.filePopulate = [
  { path: 'createdBy', select: 'name number' },
  { path: 'paymentProofFile', select: 'name' },
];

module.exports = Topup;