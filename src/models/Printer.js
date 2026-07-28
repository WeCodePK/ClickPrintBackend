const mongoose = require('mongoose');

const validatePrinterName = (v) => {
  if (/[\x00-\x1f]/.test(v)) return false;  // no control chars
  if (/[\\!,]/.test(v)) return false;       // chars Windows disallows in printer names
  return true;
};

const printerSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Field `name` is required'],
    trim: true,
    minlength: [1, 'Field `name` can not be empty'],
    maxlength: [220, 'Field `name` can not exceed 220 characters'],
    validate: {
      validator: validatePrinterName,
      message: 'Field `name` contains invalid characters',
    },
  },

  shop: {
    ref: 'Shop',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `shop` is required'],
  },

  lastSeen: {
    type: Date,
    required: true,
    default: () => new Date(0),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `lastSeen` can not be in the future',
    },
  },

  isDisabled: {
    type: Boolean,
    required: true,
    default: false,
  },

}, {
  id: false,
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

printerSchema.index({ shop: 1, name: 1 }, { unique: true });

printerSchema.virtual('isOnline').get(function () {
  if (!this.lastSeen) return false;
  return Date.now() - this.lastSeen.getTime() < 10000;
});

const Printer = mongoose.model('Printer', printerSchema);

Printer.printerPopulate = [
  { path: 'shop', select: 'name' },
];

module.exports = Printer;