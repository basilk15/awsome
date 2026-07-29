export const LIVE_CANVAS_EDGE_ZONE = 82;
export const LIVE_CANVAS_MAX_PAN_SPEED = 720;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getWheelZoomFactor({ deltaY, deltaMode = 0 }) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const normalizedDelta = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-clamp(normalizedDelta, -180, 180) * 0.0012);
}

function edgeVelocity(position, size, edgeZone, maximumSpeed) {
  if (!Number.isFinite(position) || !Number.isFinite(size) || size <= 0) return 0;
  const usableZone = Math.max(1, Math.min(edgeZone, size / 2));
  if (position < usableZone) {
    return maximumSpeed * clamp((usableZone - position) / usableZone, 0, 1);
  }
  if (position > size - usableZone) {
    return -maximumSpeed * clamp((position - (size - usableZone)) / usableZone, 0, 1);
  }
  return 0;
}

export function getLiveCanvasAutoPanDelta(
  pointer,
  viewport,
  {
    edgeZone = LIVE_CANVAS_EDGE_ZONE,
    maximumSpeed = LIVE_CANVAS_MAX_PAN_SPEED
  } = {}
) {
  return {
    x: edgeVelocity(pointer?.x, viewport?.width, edgeZone, maximumSpeed),
    y: edgeVelocity(pointer?.y, viewport?.height, edgeZone, maximumSpeed)
  };
}
