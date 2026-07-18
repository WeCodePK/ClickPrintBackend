const mongoose = require('mongoose');

const printerSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Printer name is required'],
    trim: true,
    minlength: [1, 'Printer name cannot be empty'],
    maxlength: [220, 'Printer name cannot exceed 220 characters'],
  },

  isDisabled: {
    type: Boolean,
    required: true,
    default: false,
  },

  lastSeen: {
    type: Date,
    required: true,
    default: () => new Date(0),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'lastSeen cannot be in the future',
    },
  },

  shop: {
    ref: 'Shop',
    required: [true, 'Shop is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

}, { id: false, timestamps: false, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true }, });

printerSchema.index({ shop: 1, name: 1 }, { unique: true });

printerSchema.virtual('isOnline').get(function () {
  if (!this.lastSeen) return false;
  return Date.now() - this.lastSeen.getTime() < 5000;
});

const Printer = mongoose.model('Printer', printerSchema);

Printer.printerPopulate = [
  { path: 'shop', select: 'name' },
];

module.exports = Printer;