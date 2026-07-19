const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({

  color: {
    type: Boolean,
    required: true,
  },

  pageType: {
    type: String,
    required: true,
    enum: {
      values: [ 'A4', 'A3', ],
      message: '{VALUE} is not a supported page type',
    },
  },

  pagesPerSheet: {
    type: Number,
    required: true,
    enum: {
      values: [1, 2, 4, 8, 16],
      message: '{VALUE} is not a valid pages-per-sheet value',
    },
  },

  orientation: {
    type: String,
    required: true,
    enum: {
      values: ['portrait', 'landscape'],
      message: '{VALUE} is not a valid orientation',
    },
  },

  sidedness: {
    type: String,
    required: true,
    enum: {
      values: ['none', 'long', 'short'],
      message: '{VALUE} is not a valid sidedness',
    },
  },

  numberOfCopies: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 1 && v <= 1000,
      message: 'Number of copies must be a whole number between 1 and 1000',
    },
  },

  pageSelection: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: (v) => v === '' || /^\d+(-\d+)?(,\s*\d+(-\d+)?)*$/.test(v),
      message: 'Page selection must look like "1-5", "2,4,7" or "1-3,8,11-13"',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const fileSchema = new mongoose.Schema({

  file: {
    ref: 'File',
    type: String,
    required: [true, 'File reference is required'],
  },

  settings: {
    required: false,
    type: settingsSchema,
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costLineSchema = new mongoose.Schema({

  item: {
    type: String,
    required: [true, 'Line item name is required'],
    trim: true,
    minlength: [1, 'Line item name cannot be empty'],
    maxlength: [100, 'Line item name cannot exceed 100 characters'],
  },

  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Rate must be a non-negative number',
    },
  },

  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    validate: {
      validator: (v) => Number.isInteger(v) && v >= 1,
      message: 'Quantity must be a whole number of at least 1',
    },
  },

  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Subtotal must be a non-negative number',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costExtraSchema = new mongoose.Schema({

  item: {
    type: String,
    required: [true, 'Extra item name is required'],
    trim: true,
    minlength: [1, 'Extra item name cannot be empty'],
    maxlength: [100, 'Extra item name cannot exceed 100 characters'],
  },

  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    validate: {
      validator: (v) => Number.isFinite(v),
      message: 'Subtotal must be a valid number',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

const costSchema = new mongoose.Schema({

  total: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => Number.isFinite(v) && v >= 0,
      message: 'Total must be a non-negative number',
    },
  },

  lines: {
    default: [],
    type: [costLineSchema],
  },

  extra: {
    default: [],
    type: [costExtraSchema],
  },

}, { _id: false, timestamps: false, versionKey: false, });

const draftSchema = new mongoose.Schema({

  files: {
    required: false,
    default: [],
    type: [fileSchema],
    validate: {
      validator: (v) => !Array.isArray(v) || v.length <= 50,
      message: 'A draft cannot contain more than 50 files',
    },
  },

  cost: {
    required: false,
    type: costSchema,
  },

  shop: {
    ref: 'Shop',
    required: false,
    type: mongoose.Schema.Types.ObjectId,
  },

  createdBy: {
    ref: 'User',
    required: [true, 'Creator is required'],
    type: mongoose.Schema.Types.ObjectId,
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