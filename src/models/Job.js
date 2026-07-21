const mongoose = require('mongoose');
const Draft = require('./Draft');

const jobSchema = Draft.draftSchema.clone();

const jobStatusEnum = [
  'submitted', 'queued', 'printing',
  'cancelled', 'completed', 'failed',
];

const statusHistorySchema = new mongoose.Schema({
  at: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Status timestamp cannot be in the future',
    },
  },
  by: {
    type: String,
    required: true,
    enum: {
      values: ['user', 'shop', 'system'],
      message: '{VALUE} is not a valid actor',
    },
  },
  status: {
    type: String,
    required: true,
    enum: {
      values: jobStatusEnum,
      message: '{VALUE} is not a valid status',
    },
  },
}, {
  _id: false,
  timestamps: false,
  versionKey: false,
});

jobSchema.add({
  status: {
    type: String,
    required: [true, 'Status is required'],
    default: 'submitted',
    enum: {
      values: jobStatusEnum,
      message: '{VALUE} is not a valid status',
    },
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'createdAt cannot be in the future',
    },
  },
  statusHistory: {
    required: true,
    default: [],
    type: [statusHistorySchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length >= 1,
      message: 'Status history must contain at least one entry',
    },
  },
});

// Tighten the fields inherited as optional from the draft
jobSchema.path('shop').required(true, 'Shop is required');
jobSchema.path('cost').required(true, 'Cost is required');
jobSchema.path('files').validate({
  validator: (v) => Array.isArray(v) && v.length >= 1,
  message: 'A job must contain at least one file',
});

// Every file on a submitted job must carry print settings
jobSchema.path('files').validate({
  validator: (v) => !Array.isArray(v) || v.every((f) => f.settings != null),
  message: 'Every file on a job must have print settings',
});

// status must match the most recent history entry
jobSchema.pre('validate', function (next) {
  if (this.statusHistory?.length) {
    const latest = this.statusHistory[this.statusHistory.length - 1];
    if (latest.status !== this.status) {
      return next(new Error('status must match the latest statusHistory entry'));
    }
  }
  next();
});

jobSchema.index({ shop: 1, status: 1, createdAt: -1 });
jobSchema.index({ createdBy: 1, createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);
Job.jobSchema = jobSchema;

Job.jobPopulate = [...Draft.draftPopulate];

module.exports = Job;