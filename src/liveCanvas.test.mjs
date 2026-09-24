import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canShowLiveEdgeLabel,
  getKeyboardZoomDirection,
  getLiveCanvasAutoPanDelta,
  getLiveEdgeDisplayLabel,
  getZoomedCanvasViewport,
  getWheelZoomFactor
} from './liveCanvas.mjs';

test('live edge captions keep route destinations and shorten crowded relationships', () => {
  assert.equal(getLiveEdgeDisplayLabel('effective main route table'), 'main route');
  assert.equal(getLiveEdgeDisplayLabel('explicit route table association'), 'explicit route');
  assert.equal(getLiveEdgeDisplayLabel('routes 0.0.0.0/0 to target'), '0.0.0.0/0');
  assert.equal(getLiveEdgeDisplayLabel('contains subnet'), 'contains subnet');
  assert.equal(getLiveEdgeDisplayLabel('Security Group attached to EC2'), 'attached');
});

test('live edge captions appear only when the whole caption fits between nodes', () => {
  assert.equal(canShowLiveEdgeLabel(100, 65), false);
  assert.equal(canShowLiveEdgeLabel(101, 65), true);
  assert.equal(canShowLiveEdgeLabel(50, Number.NaN), false);
});

test('keyboard zoom recognizes modifier plus and minus keys', () => {
  assert.equal(getKeyboardZoomDirection({ ctrlKey: true, key: '+', code: 'Equal' }), 1);
  assert.equal(getKeyboardZoomDirection({ ctrlKey: true, key: '=', code: 'Equal' }), 1);
  assert.equal(getKeyboardZoomDirection({ metaKey: true, key: 'Add', code: 'NumpadAdd' }), 1);
  assert.equal(getKeyboardZoomDirection({ ctrlKey: true, key: '-', code: 'Minus' }), -1);
  assert.equal(getKeyboardZoomDirection({ ctrlKey: true, key: '_', code: 'Minus' }), -1);
  assert.equal(getKeyboardZoomDirection({ metaKey: true, key: 'Subtract', code: 'NumpadSubtract' }), -1);
  assert.equal(getKeyboardZoomDirection({ key: '+' }), 0);
  assert.equal(getKeyboardZoomDirection({ ctrlKey: true, key: 'a', code: 'KeyA' }), 0);
});

test('wheel direction follows canvas zoom conventions', () => {
  assert.ok(getWheelZoomFactor({ deltaY: -100 }) > 1, 'scrolling up zooms in');
  assert.ok(getWheelZoomFactor({ deltaY: 100 }) < 1, 'scrolling down zooms out');
  assert.equal(getWheelZoomFactor({ deltaY: 0 }), 1);
  assert.ok(getWheelZoomFactor({ deltaY: -3, deltaMode: 1 }) > 1);
  assert.ok(getWheelZoomFactor({ deltaY: 1, deltaMode: 2 }) < 1);
});

test('wheel zoom keeps the point below the cursor stable', () => {
  const viewport = getZoomedCanvasViewport({
    zoom: 1,
    pan: { x: -120, y: -80 },
    cursor: { x: 350, y: 240 },
    factor: 1.25,
    minZoom: 0.45,
    maxZoom: 2.4,
    viewport: { width: 900, height: 600 },
    canvasSize: 3000
  });

  assert.equal(viewport.zoom, 1.25);
  assert.deepEqual(viewport.pan, { x: -237.5, y: -160 });
});

test('wheel zoom clamps both scale and panning bounds', () => {
  const zoomedOut = getZoomedCanvasViewport({
    zoom: 0.5,
    pan: { x: -50, y: -50 },
    cursor: { x: 0, y: 0 },
    factor: 0.1,
    minZoom: 0.45,
    maxZoom: 2.4,
    viewport: { width: 900, height: 600 },
    canvasSize: 3000
  });
  const zoomedIn = getZoomedCanvasViewport({
    zoom: 2,
    pan: { x: -300, y: -300 },
    cursor: { x: 900, y: 600 },
    factor: 10,
    minZoom: 0.45,
    maxZoom: 2.4,
    viewport: { width: 900, height: 600 },
    canvasSize: 3000
  });

  assert.equal(zoomedOut.zoom, 0.45);
  assert.deepEqual(zoomedOut.pan, { x: -45, y: -45 });
  assert.equal(zoomedIn.zoom, 2.4);
  assert.deepEqual(zoomedIn.pan, { x: -540, y: -480 });
});

test('edge auto-pan reveals canvas space in the dragged direction', () => {
  const viewport = { width: 1000, height: 700 };
  const center = getLiveCanvasAutoPanDelta({ x: 500, y: 350 }, viewport);
  assert.deepEqual(center, { x: 0, y: 0 });

  const left = getLiveCanvasAutoPanDelta({ x: 5, y: 350 }, viewport);
  const right = getLiveCanvasAutoPanDelta({ x: 995, y: 350 }, viewport);
  const top = getLiveCanvasAutoPanDelta({ x: 500, y: 5 }, viewport);
  const bottom = getLiveCanvasAutoPanDelta({ x: 500, y: 695 }, viewport);

  assert.ok(left.x > 0, 'panning right reveals space to the left');
  assert.ok(right.x < 0, 'panning left reveals space to the right');
  assert.ok(top.y > 0, 'panning down reveals space above');
  assert.ok(bottom.y < 0, 'panning up reveals space below');
});

test('edge auto-pan speed grows near the boundary and stays bounded', () => {
  const viewport = { width: 600, height: 400 };
  const nearEdge = getLiveCanvasAutoPanDelta(
    { x: 40, y: 200 },
    viewport,
    { edgeZone: 80, maximumSpeed: 20 }
  );
  const atEdge = getLiveCanvasAutoPanDelta(
    { x: 0, y: 200 },
    viewport,
    { edgeZone: 80, maximumSpeed: 20 }
  );
  assert.ok(atEdge.x > nearEdge.x);
  assert.equal(atEdge.x, 20);
  assert.equal(atEdge.y, 0);
});
