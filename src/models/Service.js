const mongoose = require('mongoose');

const keysSchema = new mongoose.Schema({

  pageType: {
    type: String,
    required: true,
    enum: {
      values: [ 'A4', 'A3' ],
      message: '{VALUE} is not a supported page type',
    },
  },

  color: {
    type: Boolean,
    required: true,
  },

  sidedness: {
    type: Boolean,
    required: true,
  },

}, { _id: false, timestamps: false, versionKey: false, });

const servicePrinterSchema = new mongoose.Schema({

  useAuto: {
    type: Boolean,
    required: true,
    default: false,
  },

  printer: {
    ref: 'Printer',
    required: [true, 'Printer is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

}, { _id: false, timestamps: false, versionKey: false, });

const serviceSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    minlength: [2, 'Service name must be at least 2 characters'],
    maxlength: [100, 'Service name cannot exceed 100 characters'],
  },

  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0 && v <= 100000,
      message: 'Rate must be a non-negative number up to 100000',
    },
  },

  keys: {
    required: [true, 'Service keys are required'],
    type: keysSchema,
  },

  shop: {
    ref: 'Shop',
    required: [true, 'Shop is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  printers: {
    required: true,
    default: [],
    type: [servicePrinterSchema],
    validate: {
      validator(v) {
        if (!Array.isArray(v)) return false;
        const ids = v.map((p) => String(p.printer));
        return new Set(ids).size === ids.length;
      },
      message: 'The same printer cannot be listed twice on one service',
    },
  },

  isDisabled: {
    type: Boolean,
    required: true,
    default: false,
  },

}, { timestamps: false, versionKey: false, });

serviceSchema.index({ shop: 1, name: 1 }, { unique: true });
serviceSchema.index({ shop: 1, 'keys.color': 1, 'keys.pageType': 1, 'keys.sidedness': 1 }, { unique: true });

const Service = mongoose.model('Service', serviceSchema);

Service.servicePopulate = [
  { path: 'shop', select: 'name' },
  { path: 'printers.printer', select: 'name' },
];

module.exports = Service;