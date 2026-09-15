const mongoose = require('mongoose');
const { isValidPhoneNumber } = require('../func/misc');

const collapseSpaces = (v) => v.replace(/\s+/g, ' ').trim();

// Normalise: strip spaces/dashes/parens, turn +923… / 03… into 923XXXXXXXXX
const normalizePhoneNumber = (v) => v
  .replace(/[\s\-()]/g, '')
  .replace(/^\+/, '')
  .replace(/^0(?=3\d{9}$)/, '92');

// -------------------------------------------------------------------------- //

// Every contact form lives in the same collection, told apart by `type`.
// To add a new form, add an entry here and mount a route for it; each field
// spec supports: required, maxlength, set (normaliser), validate + message.
const contactTypes = {

  form: {
    label: 'Contact form submission',
    fields: {
      name: { required: true, maxlength: 50, set: collapseSpaces },
      email: {
        required: true,
        maxlength: 100,
        set: (v) => v.trim().toLowerCase(),
        validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'must be a valid email address',
      },
      number: {
        required: true,
        set: normalizePhoneNumber,
        validate: isValidPhoneNumber,
        message: 'must be a valid Pakistani mobile number (e.g. 03001234567)',
      },
      message: { required: true, maxlength: 2000, set: (v) => v.trim() },
    },
  },

  register: {
    label: 'Shop registration request',
    fields: {
      name: { required: true, maxlength: 50, set: collapseSpaces },
      email: {
        required: true,
        maxlength: 100,
        set: (v) => v.trim().toLowerCase(),
        validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'must be a valid email address',
      },
      number: {
        required: true,
        set: normalizePhoneNumber,
        validate: isValidPhoneNumber,
        message: 'must be a valid Pakistani mobile number (e.g. 03001234567)',
      },
      shopName: { required: true, maxlength: 50, set: collapseSpaces },
      shopAddress: { required: true, maxlength: 100, set: collapseSpaces },
    },
  },

};

// -------------------------------------------------------------------------- //

const contactSchema = new mongoose.Schema({

  type: {
    type: String,
    required: [true, 'Field `type` is required'],
    enum: {
      values: Object.keys(contactTypes),
      message: '`{VALUE}` is not a valid value for field `type`',
    },
  },

  fields: {
    type: Map,
    of: String,
    default: () => new Map(),
  },

  createdAt: {
    type: Date,
    required: true,
    default: () => new Date(),
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `createdAt` can not be in the future',
    },
  },

}, { timestamps: false, versionKey: false });

// Validate and normalise `fields` against the spec for this document's type.
contactSchema.pre('validate', function () {
  const spec = contactTypes[this.type]?.fields;
  if (!spec) return; // the `type` enum validator reports this

  for (const key of this.fields.keys()) {
    if (!spec[key]) this.invalidate(`fields.${key}`, `Field \`${key}\` is not allowed`);
  }

  for (const [key, rules] of Object.entries(spec)) {
    let value = this.fields.get(key);

    if (rules.set && typeof value === 'string') value = rules.set(value);

    if (value === undefined || value === '') {
      this.fields.delete(key);
      if (rules.required) this.invalidate(`fields.${key}`, `Field \`${key}\` is required`);
      continue;
    }

    this.fields.set(key, value);

    if (rules.maxlength && value.length > rules.maxlength) {
      this.invalidate(`fields.${key}`, `Field \`${key}\` can not exceed ${rules.maxlength} characters`);
    } else if (rules.validate && !rules.validate(value)) {
      this.invalidate(`fields.${key}`, `Field \`${key}\` ${rules.message || 'is invalid'}`);
    }
  }
});

const Contact = mongoose.model('Contact', contactSchema);

Contact.types = contactTypes;

// Keep only the fields the given type accepts, so stray body keys are ignored.
Contact.pickFields = (type, body = {}) => Object.fromEntries(
  Object.keys(contactTypes[type].fields)
    .filter((key) => body[key] !== undefined && body[key] !== null)
    .map((key) => [key, body[key]])
);

Contact.formatMessage = (contact) => [
  `New ${contactTypes[contact.type].label}`,
  ...[...contact.fields].map(([key, value]) => `${key}: ${value}`),
].join('\n');

module.exports = Contact;
