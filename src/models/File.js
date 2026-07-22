const crypto = require('crypto');
const mongoose = require('mongoose');

const validateFileName = (v) => {
  if (/[/\\]/.test(v)) return false;          // no path separators
  if (/[\x00-\x1f]/.test(v)) return false;    // no control chars (incl. null, newline)
  if (v === '.' || v === '..') return false;  // no dir references
  if (/[<>:"|?*]/.test(v)) return false;      // no Windows-illegal / header-risky chars
  if (/[. ]$/.test(v)) return false;          // no trailing dot or space
  return true;
};

const fileSchema = new mongoose.Schema({

  _id: {
    type: String,
    required: true,
    default: () => crypto.randomUUID(),
    match: [
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Field `_id` must be a valid uuidv4'
    ],
  },

  name: {
    type: String,
    required: [true, 'Field `name` is required'],
    trim: true,
    minlength: [1, 'Field `name` can not be empty'],
    maxlength: [255, 'Field `name` can not exceed 255 characters'],
    validate: {
      validator: validateFileName,
      message: 'Field `name` contains invalid path characters or sequences',
    },
  },

  type: {
    type: String,
    required: [true, 'Field `type` is required'],
    enum: {
      values: ['raw', 'pdf'],
      message: '`{VALUE}` is not a valid value for field `type`',
    },
  },

  numberOfPages: {
    type: Number,
    required: [
      function () { return this.type === 'pdf'; },
      'Field `numberOfPages` is required for `type` = `pdf` files',
    ],
    validate: {
      validator(v) {
        if (v === undefined || v === null) return true;
        return Number.isInteger(v) && v >= 1 && v <= 10000;
      },
      message: 'Field `numberOfPages` must be a whole number between 1 and 10000',
    },
  },

  uploadedBy: {
    ref: 'User',
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Field `uploadedBy` is required'],
  },

  uploadedAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `uploadedAt` can not be in the future',
    },
  },

}, { timestamps: false, versionKey: false, });

const File = mongoose.model('File', fileSchema);

File.filePopulate = [
  { path: 'uploadedBy', select: 'name number' },
];

module.exports = File;