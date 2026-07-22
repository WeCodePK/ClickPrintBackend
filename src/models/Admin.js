const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({

  _id: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `_id` is required'],
  },

  appointedBy: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `appointedBy` is required'],
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

const Admin = mongoose.model('Admin', adminSchema);

Admin.adminPopulate = [
  { path: '_id', select: 'name number' },
  { path: 'appointedBy', select: 'name number' },
];

module.exports = Admin;