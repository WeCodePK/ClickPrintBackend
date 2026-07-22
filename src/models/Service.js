const mongoose = require('mongoose');

const validateServiceName = (v) => {
  if (!/^[\p{L}\p{N}\s.,'&()\-\/+x]*$/u.test(v)) return false;                  // allowed chars only
  if (!/[\p{L}\p{N}]/u.test(v)) return false;                                   // must contain a letter or digit
  if (!/^[\p{L}\p{N}(].*[\p{L}\p{N})]$|^[\p{L}\p{N}]$/u.test(v)) return false;  // sane start/end
  if (/([.,'&()\-\/+])\1/.test(v)) return false;                                // no repeated punctuation
  return true;
};

const keysSchema = new mongoose.Schema({

  pageType: {
    type: String,
    required: true,
    enum: {
      values: [ 'A4', 'A3' ],
      message: '`{VALUE}` is not a valid value for field `pageType`',
    },
  },

  color: {
    type: Boolean,
    required: [true, 'Field `color` is required'],
  },

  sidedness: {
    type: Boolean,
    required: [true, 'Field `sidedness` is required'],
  },

}, { _id: false, timestamps: false, versionKey: false, });

const servicePrinterSchema = new mongoose.Schema({

  useAuto: {
    type: Boolean,
    required: [true, 'Field `useAuto` is required'],
  },

  printer: {
    ref: 'Printer',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `printer` is required'],
  },

}, { _id: false, timestamps: false, versionKey: false, });

const serviceSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Field `name` is required'],
    trim: true,
    set: (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v,
    minlength: [2, 'Field `name` must be at least 2 characters'],
    maxlength: [50, 'Field `name` can not exceed 50 characters'],
    validate: {
      validator: validateServiceName,
      message: 'Field `name` contains invalid characters or sequences',
    },
  },

  rate: {
    type: Number,
    required: [true, 'Field `rate` is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0 && v <= 1000,
      message: 'Field `rate` must be a non-negative number up to 1000',
    },
  },

  keys: {
    type: keysSchema,
    required: [true, 'Field `keys` are required'],
  },

  shop: {
    ref: 'Shop',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `shop` is required'],
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
      message: 'Field `printers` can not contain duplicates',
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