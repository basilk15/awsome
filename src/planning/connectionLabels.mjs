export const MAX_PLANNING_CONNECTION_LABEL_LENGTH = 240;

export class PlanningConnectionLabelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanningConnectionLabelError';
  }
}

/**
 * Validate user input before saving it as an architecture connection label.
 * Empty (including whitespace-only) labels are valid and clear the label.
 */
export function validatePlanningConnectionLabel(value) {
  if (typeof value !== 'string') {
    return {
      valid: false,
      label: '',
      error: 'Connection label must be text.'
    };
  }

  const label = value.trim();
  if (label.length > MAX_PLANNING_CONNECTION_LABEL_LENGTH) {
    return {
      valid: false,
      label,
      error: `Connection labels can be at most ${MAX_PLANNING_CONNECTION_LABEL_LENGTH} characters.`
    };
  }

  return { valid: true, label, error: null };
}

/**
 * Return a new edge collection with one label changed. A blank valid label
 * removes the label property so exported planning documents stay compact.
 */
export function updatePlanningConnectionLabel(edges, edgeId, value) {
  if (!Array.isArray(edges)) {
    throw new TypeError('Planning edges must be an array.');
  }

  const validation = validatePlanningConnectionLabel(value);
  if (!validation.valid) {
    throw new PlanningConnectionLabelError(validation.error);
  }

  const index = edges.findIndex((edge) => edge?.id === edgeId);
  if (index === -1) return edges;

  const edge = edges[index];
  const nextEdge = validation.label
    ? { ...edge, label: validation.label }
    : Object.fromEntries(Object.entries(edge).filter(([key]) => key !== 'label'));

  const labelAlreadyMatches = edge.label === validation.label;
  const labelAlreadyAbsent = !validation.label && !Object.hasOwn(edge, 'label');
  if (labelAlreadyMatches || labelAlreadyAbsent) return edges;

  return [...edges.slice(0, index), nextEdge, ...edges.slice(index + 1)];
}
