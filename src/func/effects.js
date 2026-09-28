const Job = require('../models/Job');
const History = require('../models/History');

// -------------------------------------------------------------------------- //

// Side effects fired by runSideEffects() on job status transitions. Each
// receives the (already saved) job and an optional Mongo session so callers
// can run them inside a transaction; when no session is given they run on
// their own. They must be idempotent enough to tolerate the transition having
// already been persisted.

// Archive a terminal job into the History collection and remove it from the
// active Jobs collection. The original _id is preserved so references stay
// stable across the move.
async function moveJobToHistory(job, session) {
  const archived = job.toObject();

  await History.create([archived], { session });
  await Job.deleteOne({ _id: job._id }, { session });
}

module.exports = { moveJobToHistory };
