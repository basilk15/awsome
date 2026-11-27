import { useEffect, useState } from 'react';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, PLANNING_CANVAS_SIZE as size } from './planning/liveTopology.mjs';
import styles from '../styles/Home.module.css';

export default function PlanOverview({ canvasRef, nodes, selectedId, zoom, pan, onPan }) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [open, canvasRef]);

  function centerAt(x, y) {
    const axis = (center, length) => Math.min(0, Math.max(length - size * zoom, length / 2 - center * zoom));
    onPan({ x: axis(x, viewport.width), y: axis(y, viewport.height) });
  }

  function navigate(event) {
    const direction = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!direction) return;
    event.preventDefault();
    centerAt(((0.5 + direction[0] / 2) * viewport.width - pan.x) / zoom,
      ((0.5 + direction[1] / 2) * viewport.height - pan.y) / zoom);
  }

  return <details className={styles.planOverview} onToggle={event => setOpen(event.currentTarget.open)}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <summary>Plan overview</summary>
    {open && <button type="button" className={styles.overviewMap} aria-label="Center plan view. Use arrow keys to pan."
      onKeyDown={navigate} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!event.detail) centerAt(size / 2, size / 2);
        else centerAt((event.clientX - rect.left) / rect.width * size, (event.clientY - rect.top) / rect.height * size);
      }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {nodes.map(node => <rect key={node.id} x={node.x} y={node.y} width={node.width || DEFAULT_NODE_WIDTH}
          height={node.height || DEFAULT_NODE_HEIGHT} rx="12" fill={node.id === selectedId ? 'var(--accent)' : 'var(--muted)'} />)}
        <rect x={-pan.x / zoom} y={-pan.y / zoom} width={viewport.width / zoom} height={viewport.height / zoom}
          fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </button>}
  </details>;
}
