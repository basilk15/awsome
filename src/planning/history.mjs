export const DEFAULT_PLANNING_HISTORY_LIMIT = 50;

function normalizeLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Planning history limit must be a positive integer.');
  }
  return limit;
}

function snapshot(document) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('A planning document must be an object.');
  }
  return structuredClone(document);
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && valuesEqual(left[key], right[key])
  );
}

function assertHistory(history) {
  if (
    !history
    || typeof history !== 'object'
    || !Array.isArray(history.past)
    || !Array.isArray(history.future)
    || history.present === null
    || typeof history.present !== 'object'
  ) {
    throw new TypeError('A valid planning history is required.');
  }
  normalizeLimit(history.limit);
}

export function createPlanningHistory(document, { limit = DEFAULT_PLANNING_HISTORY_LIMIT } = {}) {
  return {
    past: [],
    present: snapshot(document),
    future: [],
    limit: normalizeLimit(limit)
  };
}

export function resetPlanningHistory(history, document, options = {}) {
  assertHistory(history);
  return createPlanningHistory(document, {
    limit: options.limit ?? history.limit
  });
}

export function recordPlanningHistory(history, document) {
  assertHistory(history);
  const nextDocument = snapshot(document);
  if (valuesEqual(history.present, nextDocument)) return history;

  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: nextDocument,
    future: [],
    limit: history.limit
  };
}

export function undoPlanningHistory(history) {
  assertHistory(history);
  if (!canUndoPlanningHistory(history)) return history;

  const previousIndex = history.past.length - 1;
  return {
    past: history.past.slice(0, previousIndex),
    present: history.past[previousIndex],
    future: [history.present, ...history.future],
    limit: history.limit
  };
}

export function redoPlanningHistory(history) {
  assertHistory(history);
  if (!canRedoPlanningHistory(history)) return history;

  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: history.future[0],
    future: history.future.slice(1),
    limit: history.limit
  };
}

export function canUndoPlanningHistory(history) {
  assertHistory(history);
  return history.past.length > 0;
}

export function canRedoPlanningHistory(history) {
  assertHistory(history);
  return history.future.length > 0;
}
