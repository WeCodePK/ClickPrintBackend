const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    minlength: [2, 'Shop name must be at least 2 characters'],
    maxlength: [100, 'Shop name cannot exceed 100 characters'],
    match: [/^[\p{L}\p{N}\s.,'&()\-]+$/u, 'Shop name contains invalid characters'],
  },

  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    minlength: [5, 'Address is too short'],
    maxlength: [250, 'Address cannot exceed 250 characters'],
  },

  coordinates: {
    type: [Number],
    required: [true, 'Coordinates are required'],
    validate: {
      validator(v) {
        // Expected order: [latitude, longitude]
        if (!Array.isArray(v) || v.length !== 2) return false;
        const [lat, lng] = v;
        return (
          Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
          Number.isFinite(lng) && lng >= -180 && lng <= 180
        );
      },
      message: 'Coordinates must be [latitude, longitude] within valid ranges',
    },
  },

  imageFile: {
    type: String,
    ref: 'File',
    required: [true, 'Shop image is required'],
    trim: true,
  },

  isDisabled: {
    type: Boolean,
    required: true,
    default: true,
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

  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true,
    validate: {
      validator(v) {
        // Normalise: strip spaces/dashes/parens, turn +92 into 0
        const digits = v.replace(/[\s\-()]/g, '').replace(/^\+92/, '0');
        // PK mobile = 11 digits (03XXXXXXXXX); landline = 10 digits (0XX…)
        return /^0\d{9,10}$/.test(digits);
      },
      message: 'Enter a valid Pakistani phone number (e.g. 03001234567 or 0511234567)',
    },
  },

  googleMapsLink: {
    type: String,
    trim: true,
    match: [
      /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)\/?.*/i,
      'Must be a valid Google Maps URL',
    ],
  },

  timings: {
    type: [String],
    required: true,
    validate: {
      validator(v) {
        if (!Array.isArray(v) || v.length !== 7) return false;
        // Each entry: "Closed" or "HH:MM-HH:MM"
        return v.every((t) =>
          /^(closed|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)$/i.test(t.trim())
        );
      },
      message: 'Timings must be 7 entries, each "Closed" or "HH:MM-HH:MM"',
    },
  },

}, { timestamps: false, versionKey: false, });

const Shop = mongoose.model('Shop', shopSchema);

Shop.shopPopulate = [
  { path: 'imageFile', select: 'name' },
];

module.exports = Shop;