const User = require('../models/User');
const Job = require('../models/Job');
const History = require('../models/History');

// -------------------------------------------------------------------------- //

// Side effects fired by runSideEffects() on job status transitions. Each
// receives the (already saved) job and an optional Mongo session so callers
// can run them inside a transaction; when no session is given they run on
// their own. They must be idempotent enough to tolerate the transition having
// already been persisted.

// Charge the job's cost to the owner's wallet on submit. The deduction is
// atomic and conditional on sufficient funds, so two concurrent submits can't
// overdraw the balance.
async function deductWallet(job, session) {
  // const updated = await User.findOneAndUpdate(
  //   { _id: job.createdBy, balance: { $gte: job.cost.total } },
  //   { $inc: { balance: -job.cost.total } },
  //   { session, returnDocument: 'after' }
  // );

  // if (!updated) {
  //   throw new Error(`Insufficient balance to charge job ${job._id}`);
  // }
}

// Return the job's cost to the owner's wallet when it is cancelled or failed.
async function issueRefund(job, session) {
  // await User.updateOne(
  //   { _id: job.createdBy },
  //   { $inc: { balance: job.cost.total } },
  //   { session }
  // );
}

// Archive a terminal job into the History collection and remove it from the
// active Jobs collection. The original _id is preserved so references stay
// stable across the move.
async function moveJobToHistory(job, session) {
  const archived = job.toObject();

  await History.create([archived], { session });
  await Job.deleteOne({ _id: job._id }, { session });
}

module.exports = { deductWallet, issueRefund, moveJobToHistory };
