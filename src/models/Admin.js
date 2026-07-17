const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({

  user: {
    ref: 'User',
    required: [true, 'User is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  appointedBy: {
    ref: 'User',
    required: [true, 'Appointing user is required'],
    type: mongoose.Schema.Types.ObjectId,
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

adminSchema.index({ user: 1 }, { unique: true });

const Admin = mongoose.model('Admin', adminSchema);

Admin.adminPopulate = [
  { path: 'user', select: 'name number' },
  { path: 'appointedBy', select: 'name number' },
];

module.exports = Admin;