const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema({

  user: {
    ref: 'User',
    required: [true, 'User is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  shop: {
    ref: 'Shop',
    required: [true, 'Shop is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  appointedBy: {
    ref: 'User',
    required: [true, 'Appointing user is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  appointedByAdmin: {
    type: Boolean,
    required: true,
  },

  appointedAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'appointedAt cannot be in the future',
    },
  },

}, { timestamps: false, versionKey: false });

ownerSchema.index({ user: 1, shop: 1 }, { unique: true });

const Owner = mongoose.model('Owner', ownerSchema);

Owner.ownerPopulate = [
  { path: 'user', select: 'name number' },
  { path: 'shop', select: 'name' },
  { path: 'appointedBy', select: 'name number' },
];

module.exports = Owner;