export const LIVE_CANVAS_EDGE_ZONE = 82;
export const LIVE_CANVAS_MAX_PAN_SPEED = 720;
export const LIVE_EDGE_LABEL_CLEARANCE = 36;

export function getLiveEdgeDisplayLabel(label) {
  const fullLabel = String(label ?? '').trim();
  if (!fullLabel) return 'relationship';

  const route = /^routes?\s+(\S+)\s+to target$/i.exec(fullLabel);
  if (route) return route[1].length <= 18 ? route[1] : `${route[1].slice(0, 17)}…`;
  if (fullLabel === 'effective main route table') return 'main route';
  if (fullLabel === 'explicit route table association') return 'explicit route';
  if (fullLabel.length <= 18) return fullLabel;

  const relationship = [
    'belongs to', 'attached', 'associated', 'contains', 'connects',
    'forwards', 'registers', 'evaluates', 'requests', 'accepted',
    'provides', 'placed in', 'serves', 'hosts', 'has listener'
  ].find((term) => fullLabel.toLowerCase().includes(term));
  return relationship || `${fullLabel.slice(0, 17).trimEnd()}…`;
}

export function canShowLiveEdgeLabel(edgeLength, labelWidth) {
  return Number.isFinite(edgeLength)
    && Number.isFinite(labelWidth)
    && edgeLength >= labelWidth + LIVE_EDGE_LABEL_CLEARANCE;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getWheelZoomFactor({ deltaY, deltaMode = 0 }) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const normalizedDelta = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * 80
      : deltaY;
  return Math.exp(-clamp(normalizedDelta, -180, 180) * 0.0012);
}

export function getKeyboardZoomDirection(event) {
  if (!event?.ctrlKey && !event?.metaKey) return 0;
  const key = event.key;
  const code = event.code;
  if (key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd') return 1;
  if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') return -1;
  return 0;
}

export function getZoomedCanvasViewport({
  zoom,
  pan,
  cursor,
  factor,
  minZoom,
  maxZoom,
  viewport,
  canvasSize
}) {
  const currentZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const currentPan = {
    x: Number.isFinite(pan?.x) ? pan.x : 0,
    y: Number.isFinite(pan?.y) ? pan.y : 0
  };
  const cursorPoint = {
    x: Number.isFinite(cursor?.x) ? cursor.x : 0,
    y: Number.isFinite(cursor?.y) ? cursor.y : 0
  };
  const zoomFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const nextZoom = clamp(currentZoom * zoomFactor, minZoom, maxZoom);
  const worldPoint = {
    x: (cursorPoint.x - currentPan.x) / currentZoom,
    y: (cursorPoint.y - currentPan.y) / currentZoom
  };
  const nextPan = {
    x: cursorPoint.x - worldPoint.x * nextZoom,
    y: cursorPoint.y - worldPoint.y * nextZoom
  };
  const minPan = {
    x: Math.min(0, viewport.width - canvasSize * nextZoom),
    y: Math.min(0, viewport.height - canvasSize * nextZoom)
  };

  return {
    zoom: nextZoom,
    pan: {
      x: clamp(nextPan.x, minPan.x, 0),
      y: clamp(nextPan.y, minPan.y, 0)
    }
  };
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
