const mongoose = require('mongoose');

const validateName = (v) => {
  if (!/^[\p{L}\p{N}\s.,'&()\-]+$/u.test(v)) return false;                    // allowed chars only
  if (!/[\p{L}\p{N}]/u.test(v)) return false;                                 // must contain a letter or digit
  if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$|^[\p{L}\p{N}]$/u.test(v)) return false;  // start & end alphanumeric
  if (/([.,'&()\-])\1/.test(v)) return false;                                 // no repeated punctuation
  return true;
};

// Looser than validateName: account titles may end with "." or ")" (e.g. "Ahad & Co.", "Ahad (Pvt.)")
const validateWalletTitle = (v) => {
  if (!/^[\p{L}\p{N}\s.,'&()\-]+$/u.test(v)) return false;  // allowed chars only
  if (!/\p{L}/u.test(v)) return false;                        // must contain a letter
  if (!/^[\p{L}\p{N}]/u.test(v)) return false;                // start alphanumeric
  if (!/[\p{L}\p{N}.)]$/u.test(v)) return false;              // end alphanumeric, "." or ")"
  if (/([.,'&()\-])\1/.test(v)) return false;                 // no repeated punctuation
  return true;
};

const collapseSpaces = (v) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;

// IBAN mod-97 check: move the first 4 chars to the end, map letters to 10..35, remainder must be 1
const isValidIbanChecksum = (iban) => {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
};

const validateWalletNumber = (v) => {
  if (/^PK/.test(v)) return /^PK\d{2}[A-Z]{4}\d{16}$/.test(v) && isValidIbanChecksum(v); // PK IBAN
  return /^\d{8,20}$/.test(v);                                                            // account or mobile wallet number
};

const walletSchema = new mongoose.Schema({

  bank: {
    type: String,
    required: [true, 'Field `wallet.bank` is required'],
    trim: true,
    set: collapseSpaces,
    minlength: [2, 'Field `wallet.bank` must be at least 2 characters'],
    maxlength: [50, 'Field `wallet.bank` can not exceed 50 characters'],
    validate: {
      validator: validateName,
      message: 'Field `wallet.bank` contains invalid characters or sequences',
    },
  },

  title: {
    type: String,
    required: [true, 'Field `wallet.title` is required'],
    trim: true,
    set: collapseSpaces,
    minlength: [2, 'Field `wallet.title` must be at least 2 characters'],
    maxlength: [100, 'Field `wallet.title` can not exceed 100 characters'],
    validate: {
      validator: validateWalletTitle,
      message: 'Field `wallet.title` contains invalid characters or sequences',
    },
  },

  number: {
    type: String,
    required: [true, 'Field `wallet.number` is required'],
    trim: true,
    // Normalise: strip spaces/dashes, uppercase IBAN letters, turn +923XXXXXXXXX into 03XXXXXXXXX
    set: (v) => typeof v === 'string'
      ? v.replace(/[\s\-]/g, '').toUpperCase().replace(/^\+92(?=3\d{9}$)/, '0')
      : v,
    validate: {
      validator: validateWalletNumber,
      message: 'Field `wallet.number` must be a valid PK IBAN (e.g. PK36SCBL0000001123456702), account number (8-20 digits) or mobile wallet number (e.g. 03001234567)',
    },
  },

}, { _id: false, id: false, versionKey: false });

const shopSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Field `name` is required'],
    trim: true,
    set: collapseSpaces,
    minlength: [2, 'Field `name` must be at least 2 characters'],
    maxlength: [50, 'Field `name` can not exceed 50 characters'],
    validate: {
      validator: validateName,
      message: 'Field `name` contains invalid characters or sequences',
    },
  },

  address: {
    type: String,
    required: [true, 'Field `address` is required'],
    trim: true,
    minlength: [5, 'Field `address` must be at least 5 characters'],
    maxlength: [100, 'Field `address` can not exceed 100 characters'],
  },

  coordinates: {
    type: [Number],
    required: [true, 'Field `coordinates` are required'],
    validate: {
      validator(v) {
        if (!Array.isArray(v) || v.length !== 2) return false;
        const [lat, lng] = v;
        return (
          Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
          Number.isFinite(lng) && lng >= -180 && lng <= 180
        );
      },
      message: 'Field `coordinates` must be [latitude, longitude] within valid ranges',
    },
  },

  contactNumber: {
    type: String,
    required: [true, 'Field `contactNumber` is required'],
    trim: true,
    validate: {
      validator(v) {
        // Normalise: strip spaces/dashes/parens, turn +92 into 0
        const digits = v.replace(/[\s\-()]/g, '').replace(/^\+92/, '0');
        // PK mobile = 11 digits (03XXXXXXXXX); landline = 10 digits (0XX…)
        return /^0\d{9,10}$/.test(digits);
      },
      message: 'Field `contactNumber` must be a valid Pakistani phone or landline number (e.g. 03001234567 or 0511234567)',
    },
  },

  googleMapsLink: {
    type: String,
    trim: true,
    match: [
      /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)\/?.*/i,
      'Field `googleMapsLink` must be a valid Google Maps URL',
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
      message: 'Field `timings` must be 7 entries, each "Closed" or "HH:MM-HH:MM"',
    },
  },

  wallet: {
    type: walletSchema,
  },

  imageFile: {
    ref: 'File',
    trim: true,
    type: String,
    required: [true, 'Field `imageFile` is required'],
  },

  isDisabled: {
    type: Boolean,
    default: true,
    required: [true, 'Field `isDisabled` is required'],
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

}, { 
  id: false,
  timestamps: false,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

shopSchema.virtual('isOnline').get(function () {
  if (!this.lastSeen) return false;
  return Date.now() - this.lastSeen.getTime() < 10000;
});

const Shop = mongoose.model('Shop', shopSchema);

Shop.shopPopulate = [
  { path: 'imageFile', select: 'name' },
];

module.exports = Shop;