import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlanningSvgArtifact,
  downloadPlanningSvgArtifact,
  escapeSvgText,
  renderPlanningArchitectureSvg,
  svgFilename
} from './canvasExport.mjs';

const catalog = [
  { key: 'ec2', name: 'Amazon EC2', color: '#ec7211' },
  { key: 's3', name: 'Amazon S3', color: '#569a31' }
];

const document = {
  name: 'Payments & orders',
  nodes: [
    { id: 'web', serviceKey: 'ec2', name: 'Web API', x: 40, y: 70, width: 180, height: 90 },
    { id: 'uploads', serviceKey: 's3', name: 'Uploads', x: 370, y: 210, width: 168, height: 84 }
  ],
  edges: [{ id: 'web-to-uploads', source: 'web', target: 'uploads', label: 'writes objects' }]
};

test('renders a standalone SVG with service names, catalog colors, and directed edges', () => {
  const svg = renderPlanningArchitectureSvg(document, catalog);

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(svg, /<title id="planning-export-title">Payments &amp; orders<\/title>/);
  assert.match(svg, /Amazon EC2/);
  assert.match(svg, /fill="#ec7211"/);
  assert.match(svg, /marker-end="url\(#planning-export-arrow\)"/);
  assert.match(svg, />writes objects<\/text>/);
  assert.match(svg, /viewBox="-\d+ -\d+ 640 400"/);
});

test('escapes untrusted names and labels as XML text instead of markup', () => {
  const malicious = {
    ...document,
    name: 'diagram <script>alert("x")</script>',
    nodes: [{ ...document.nodes[0], name: '<img src=x onerror=1> & "quote"' }, document.nodes[1]],
    edges: [{ ...document.edges[0], source: 'web', target: 'web' }, { id: 'safe-edge', source: 'web', target: 'uploads', label: '<script>bad</script> & "quoted"' }]
  };
  const svg = renderPlanningArchitectureSvg(malicious, catalog);

  assert.equal(svg.includes('<script>'), false);
  assert.match(svg, /&lt;img src=x onerror=1&gt; &amp; &quot;quote&quot;/);
  assert.match(svg, /&lt;script&gt;bad&lt;\/script&gt; &amp; &quot;quoted&quot;/);
  assert.equal(escapeSvgText(`<&>"'`), '&lt;&amp;&gt;&quot;&apos;');
});

test('excludes dangling or self-referential edges and uses a neutral fallback for unknown services', () => {
  const svg = renderPlanningArchitectureSvg({
    nodes: [...document.nodes, { id: 'unknown', serviceKey: 'not-a-service', name: 'Custom', x: 700, y: 0, width: 100, height: 80 }],
    edges: [
      ...document.edges,
      { id: 'missing', source: 'web', target: 'missing', label: 'ignored' },
      { id: 'self', source: 'web', target: 'web', label: 'ignored' }
    ]
  }, catalog);

  assert.match(svg, /Architecture diagram with 3 services and 1 directed connections\./);
  assert.match(svg, /fill="#5b6b82"/);
  assert.equal(svg.includes('ignored'), false);
});

test('creates a download-ready artifact and safely sanitizes browser filenames', () => {
  const artifact = createPlanningSvgArtifact(document, catalog, { filename: 'Payments: August / 2026' });
  assert.equal(artifact.filename, 'payments-august-2026.svg');
  assert.equal(artifact.mimeType, 'image/svg+xml;charset=utf-8');
  assert.match(artifact.svg, /<svg /);
  assert.equal(svgFilename('...'), '....svg');
});

test('uses browser APIs to trigger and later revoke an SVG download', () => {
  const calls = [];
  const browser = {
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
    URL: {
      createObjectURL(blob) { calls.push(['create', blob]); return 'blob:planning'; },
      revokeObjectURL(url) { calls.push(['revoke', url]); }
    },
    document: { createElement() { return { click() { calls.push(['click', this.href, this.download]); } }; } },
    setTimeout(callback, delay) { calls.push(['timer', delay]); callback(); }
  };
  const url = downloadPlanningSvgArtifact({ filename: 'architecture.svg', svg: '<svg/>', mimeType: 'image/svg+xml' }, browser);

  assert.equal(url, 'blob:planning');
  assert.deepEqual(calls.map(([type]) => type), ['create', 'click', 'timer', 'revoke']);
  assert.throws(() => downloadPlanningSvgArtifact({}, browser), /artifact/);
});
