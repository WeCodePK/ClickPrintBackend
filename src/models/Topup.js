const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({

  status: {
    type: String,
    required: true,
    default: 'pending',
    enum: {
      values: ['pending', 'approved', 'declined'],
      message: '{VALUE} is not a valid status',
    },
  },

  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 10 && v <= 100000 && v % 10 === 0,
      message: 'Amount must be a whole number, a multiple of 10, between 10 and 100000',
    },
  },

  paymentProofFile: {
    ref: 'File',
    required: [true, 'Payment proof is required'],
    type: String,
    trim: true,
  },

  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'createdAt cannot be in the future',
    },
  },

  createdBy: {
    ref: 'User',
    required: [true, 'Creator is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

}, { timestamps: false, versionKey: false, });

const Topup = mongoose.model('Topup', topupSchema);

Topup.filePopulate = [
  { path: 'paymentProofFile', select: 'name' },
  { path: 'createdBy', select: 'name number' },
];

module.exports = Topup;