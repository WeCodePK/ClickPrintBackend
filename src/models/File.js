const crypto = require('crypto');
const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({

  _id: {
    type: String,
    required: true,
    default: () => crypto.randomUUID(),
    match: [
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'File id must be a UUID'
    ],
  },

  name: {
    type: String,
    required: [true, 'File name is required'],
    trim: true,
    minlength: [1, 'File name cannot be empty'],
    maxlength: [255, 'File name cannot exceed 255 characters'],
    validate: {
      validator: (v) => !/[/\\]/.test(v) && !v.includes('\0') && v !== '.' && v !== '..',
      message: 'File name contains invalid path characters',
    },
  },

  type: {
    type: String,
    required: [true, 'File type is required'],
    enum: {
      values: ['raw', 'pdf'],
      message: '{VALUE} is not a valid file type',
    },
  },

  numberOfPages: {
    type: Number,
    required: [
      function () { return this.type === 'pdf'; },
      'Number of pages is required for PDF files',
    ],
    validate: {
      validator(v) {
        if (v === undefined || v === null) return true; // presence handled by required
        return Number.isInteger(v) && v >= 1 && v <= 10000;
      },
      message: 'Number of pages must be a whole number between 1 and 10000',
    },
  },

  uploadedBy: {
    ref: 'User',
    required: [true, 'Uploader is required'],
    type: mongoose.Schema.Types.ObjectId,
  },

  uploadedAt: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'uploadedAt cannot be in the future',
    },
  },

}, { timestamps: false, versionKey: false, });

const File = mongoose.model('File', fileSchema);

File.filePopulate = [
  { path: 'uploadedBy', select: 'name number' },
];

module.exports = File;