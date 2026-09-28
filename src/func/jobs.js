const { moveJobToHistory } = require('./effects');

// -------------------------------------------------------------------------- //

const STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  QUEUED: 'queued',
  PRINTING: 'printing',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  COMPLETED: 'completed',
});

const ROLE = Object.freeze({
  USER: 'user',
  SHOP: 'shop'
});

const SIDE_EFFECTS = {
  [STATUS.CANCELLED]: [moveJobToHistory],
  [STATUS.FAILED]:    [moveJobToHistory],
  [STATUS.COMPLETED]: [moveJobToHistory],
};

// Map: from -> { to: [allowedRoles] }
const TRANSITIONS = {
  [STATUS.DRAFT]: {
    [STATUS.SUBMITTED]: [ROLE.USER, ROLE.SHOP]
  },
  [STATUS.SUBMITTED]: {
    [STATUS.QUEUED]: [ROLE.SHOP],
    [STATUS.CANCELLED]: [ROLE.USER, ROLE.SHOP],
  },
  [STATUS.QUEUED]: {
    [STATUS.PRINTING]: [ROLE.SHOP],
    [STATUS.CANCELLED]: [ROLE.USER, ROLE.SHOP],
  },
  [STATUS.PRINTING]: {
    [STATUS.FAILED]: [ROLE.SHOP],
    [STATUS.COMPLETED]: [ROLE.SHOP],
  },
  // terminal states; no outbound transitions
  [STATUS.CANCELLED]: {},
  [STATUS.FAILED]:    {},
  [STATUS.COMPLETED]: {},
};

// -------------------------------------------------------------------------- //

function validateTransition(from, to, role) {
  const allowedTargets = TRANSITIONS[from];
  if (!allowedTargets || Object.keys(allowedTargets).length === 0) {
    return { ok: false, code: 409, message: `Job is in terminal state '${from}'` };
  }
  const allowedRoles = allowedTargets[to];
  if (!allowedRoles) {
    return { ok: false, code: 409, message: `Cannot transition from '${from}' to '${to}'` };
  }
  if (!allowedRoles.includes(role)) {
    return { ok: false, code: 403, message: `Role '${role}' cannot perform this transition` };
  }
  return { ok: true };
}

async function runSideEffects(targetStatus, job, session) {
  const effects = SIDE_EFFECTS[targetStatus] || [];
  for (const effect of effects) {
    await effect(job, session);
  }
}

// -------------------------------------------------------------------------- //

module.exports = { validateTransition, runSideEffects };