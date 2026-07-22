const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({

  color: {
    type: Boolean,
    required: [true, 'Field `color` is required'],
  },

  pageType: {
    type: String,
    required: [true, 'Field `pageType` is required'],
    enum: {
      values: [ 'A4', 'A3', ],
      message: '`{VALUE}` is not a valid value for field `pageType`',
    },
  },

  pagesPerSheet: {
    type: Number,
    required: [true, 'Field `pagesPerSheet` is required'],
    enum: {
      values: [1, 2, 4, 8, 16],
      message: '`{VALUE}` is not a valid value for field `pagesPerSheet`',
    },
  },

  orientation: {
    type: String,
    required: [true, 'Field `orientation` is required'],
    enum: {
      values: ['portrait', 'landscape'],
      message: '`{VALUE}` is not a valid value for field `orientation`',
    },
  },

  sidedness: {
    type: String,
    required: [true, 'Field `sidedness` is required'],
    enum: {
      values: ['none', 'long', 'short'],
      message: '`{VALUE}` is not a valid value for field `sidedness`',
    },
  },

  numberOfCopies: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
      message: 'Field `numberOfCopies` must be a whole number between 1 and 100',
    },
  },

  pageSelection: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: (v) => v === '' || /^\d+(-\d+)?(,\s*\d+(-\d+)?)*$/.test(v),
      message: 'Field `pageSelection` must look like "1-5", "2,4,7" or "1-3,8,11-13"',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const fileSchema = new mongoose.Schema({

  file: {
    ref: 'File',
    type: String,
    required: [true, 'Field `file` is required'],
  },

  settings: {
    required: false,
    type: settingsSchema,
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costLineSchema = new mongoose.Schema({

  item: {
    type: String,
    required: [true, 'Field `item` is required'],
    trim: true,
    minlength: [1, 'Field `name` can not be empty'],
    maxlength: [50, 'Field `name` cannot exceed 50 characters'],
  },

  rate: {
    type: Number,
    required: [true, 'Field `rate` is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Field `rate` must be a non-negative number',
    },
  },

  quantity: {
    type: Number,
    required: [true, 'Field `quantity` is required'],
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 1,
      message: 'Field `quantity` must be a whole number of at least 1',
    },
  },

  subtotal: {
    type: Number,
    required: [true, 'Field `subtotal` is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Field `subtotal` must be a non-negative number',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costExtraSchema = new mongoose.Schema({

  item: {
    type: String,
    required: [true, 'Field `item` is required'],
    trim: true,
    minlength: [1, 'Field `name` can not be empty'],
    maxlength: [50, 'Field `name` cannot exceed 50 characters'],
  },

  subtotal: {
    type: Number,
    required: [true, 'Field `subtotal` is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Field `subtotal` must be a non-negative number',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costSchema = new mongoose.Schema({

  lines: {
    default: [],
    type: [costLineSchema],
  },

  extra: {
    default: [],
    type: [costExtraSchema],
  },

  total: {
    type: Number,
    required: [true, 'Field `total` is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Field `total` must be a non-negative number',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const draftSchema = new mongoose.Schema({

  files: {
    default: [],
    required: false,
    type: [fileSchema],
    validate: {
      validator: (v) => !Array.isArray(v) || v.length <= 50,
      message: 'Field `files` can not contain more than 50 files',
    },
  },

  shop: {
    ref: 'Shop',
    required: false,
    type: mongoose.Schema.Types.ObjectId,
  },

  cost: {
    required: false,
    type: costSchema,
  },

  createdBy: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `createdBy` is required'],
  },

}, { timestamps: false, versionKey: false, });

const Draft = mongoose.model('Draft', draftSchema);
Draft.draftSchema = draftSchema;

Draft.draftPopulate = [
  { path: 'shop', select: 'name' },
  { path: 'createdBy', select: 'name number' },
  { path: 'files.file', select: 'name numberOfPages' }
];

module.exports = Draft;