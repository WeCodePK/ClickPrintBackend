const mongoose = require('mongoose');

const Draft = require('./Draft');
const jobSchema = Draft.draftSchema.clone();

const jobStatusEnum = [ 'submitted', 'queued', 'printing', 'cancelled', 'completed', 'failed', ];

const statusHistorySchema = new mongoose.Schema({

  at: {
    type: Date,
    required: [true, 'Field `at` is required'],
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `at` can not be in the future',
    },
  },

  by: {
    type: String,
    required: [true, 'Field `by` is required'],
    enum: {
      values: ['user', 'shop', 'system'],
      message: '`{VALUE}` is not a valid value for field `by`',
    },
  },

  status: {
    type: String,
    required: [true, 'Field `status` is required'],
    enum: {
      values: jobStatusEnum,
      message: '`{VALUE}` is not a valid value for field `status`',
    },
  },

}, { _id: false, timestamps: false, versionKey: false, });

jobSchema.add({

  status: {
    type: String,
    default: 'submitted',
    required: [true, 'Field `status` is required'],
    enum: {
      values: jobStatusEnum,
      message: '`{VALUE}` is not a value for field `status`',
    },
  },

  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'Field `createdAt` can not be in the future',
    },
  },

  statusHistory: {
    default: [],
    required: true,
    type: [statusHistorySchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length >= 1,
      message: 'Field `statusHistory` must contain at least one entry',
    },
  },

});

// Tighten the fields inherited as optional from the draft
jobSchema.path('shop').required(true, 'Field `shop` is required');
jobSchema.path('cost').required(true, 'Field `cost` is required');

jobSchema.path('files').validate({
  validator: (v) => Array.isArray(v) && v.length >= 1,
  message: 'Field `files` must contain at least one file',
});

jobSchema.path('files').validate({
  validator: (v) => !Array.isArray(v) || v.every((f) => f.settings != null),
  message: 'Field `settings` is required',
});

const Job = mongoose.model('Job', jobSchema);

Job.jobSchema = jobSchema;
Job.jobPopulate = [...Draft.draftPopulate];

module.exports = Job;