import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLiveCanvasAutoPanDelta,
  getWheelZoomFactor
} from './liveCanvas.mjs';

test('wheel direction follows canvas zoom conventions', () => {
  assert.ok(getWheelZoomFactor({ deltaY: -100 }) > 1, 'scrolling up zooms in');
  assert.ok(getWheelZoomFactor({ deltaY: 100 }) < 1, 'scrolling down zooms out');
  assert.equal(getWheelZoomFactor({ deltaY: 0 }), 1);
  assert.ok(getWheelZoomFactor({ deltaY: -3, deltaMode: 1 }) > 1);
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
