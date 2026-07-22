const mongoose = require('mongoose');

const Job = require('./Job');
const historySchema = Job.jobSchema.clone();

const History = mongoose.model('History', historySchema);
History.historyPopulate = [...Job.jobPopulate];

module.exports = History;