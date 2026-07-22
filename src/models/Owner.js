const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema({

  user: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `user` is required'],
  },

  shop: {
    ref: 'Shop',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `shop` is required'],
  },

  appointedBy: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `appointedBy` is required'],
  },

  appointedByAdmin: {
    type: Boolean,
    required: [true, 'Field `appointedByAdmin` is required'],
  },

  appointedAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `appointedAt` can not be in the future',
    },
  },

}, { timestamps: false, versionKey: false });

ownerSchema.index({ user: 1, shop: 1 }, { unique: true });

const Owner = mongoose.model('Owner', ownerSchema);

Owner.ownerPopulate = [
  { path: 'shop', select: 'name' },
  { path: 'user', select: 'name number' },
  { path: 'appointedBy', select: 'name number' },
];

module.exports = Owner;