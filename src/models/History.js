const mongoose = require('mongoose');
const Job = require('./Job');

const historySchema = Job.jobSchema.clone();

// An archived job can only be in a terminal state
historySchema.add({
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['cancelled', 'completed', 'failed'],
      message: '{VALUE} is not a valid terminal status',
    },
  },
  archivedAt: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: (v) => v <= new Date(),
      message: 'archivedAt cannot be in the future',
    },
  },
});

// Archived records are immutable — only the initial insert is allowed
historySchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('History records cannot be modified'));
  }
  next();
});

historySchema.index({ shop: 1, status: 1, archivedAt: -1 });
historySchema.index({ createdBy: 1, archivedAt: -1 });

const History = mongoose.model('History', historySchema);

// Copy, don't share the reference
History.historyPopulate = [...Job.jobPopulate];

module.exports = History;