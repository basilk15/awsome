import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';
import Icon from './Icon';
import { PLANNING_ICON_PATHS, PLANNING_SERVICES, PLANNING_SERVICE_DETAILS } from './serviceCatalog';
import { getKeyboardZoomDirection, getWheelZoomFactor, getZoomedCanvasViewport } from './liveCanvas.mjs';
import { MAX_PLANNING_CONNECTION_LABEL_LENGTH, updatePlanningConnectionLabel } from './planning/connectionLabels.mjs';
import { createPlanningSvgArtifact, downloadPlanningSvgArtifact } from './planning/canvasExport.mjs';
import { DEFAULT_PLANNING_ZOOM, MAX_PLANNING_ZOOM, MIN_PLANNING_ZOOM } from './planningDocument.mjs';
import { DEFAULT_NODE_HEIGHT as DEFAULT_PLANNING_NODE_HEIGHT, DEFAULT_NODE_WIDTH as DEFAULT_PLANNING_NODE_WIDTH, PLANNING_CANVAS_SIZE } from './planning/liveTopology.mjs';

const MIN_PLANNING_NODE_WIDTH = 126;
const MIN_PLANNING_NODE_HEIGHT = 68;

function getPlanningNodeVisualStyle(node) {
  const widthRatio = (node.width || DEFAULT_PLANNING_NODE_WIDTH) / DEFAULT_PLANNING_NODE_WIDTH;
  const heightRatio = (node.height || DEFAULT_PLANNING_NODE_HEIGHT) / DEFAULT_PLANNING_NODE_HEIGHT;
  const scale = Math.min(2.2, Math.max(0.85, Math.sqrt(widthRatio * heightRatio)));
  return {
    '--node-icon-size': `${Math.round(42 * scale)}px`,
    '--node-icon-image-size': `${Math.round(32 * scale)}px`,
    '--node-icon-radius': `${Math.round(8 * scale)}px`,
    '--node-label-size': `${Math.round(15 * scale * 10) / 10}px`,
    '--node-content-gap': `${Math.round(9 * scale)}px`,
    '--node-content-padding': `${Math.round(10 * Math.min(scale, 1.55))}px`
  };
}

function PlanningServiceIcon({ service, small = false }) {
  const src = PLANNING_ICON_PATHS[service.key];
  return <span className={`${styles.serviceIcon} ${small ? styles.serviceIconSmall : ''}`} style={{ '--service-color': service.color }}>
    {src ? <img src={src} alt="" /> : <span>{service.name.replace('Amazon ', '').replace('AWS ', '').split(' ').map((word) => word[0]).join('').slice(0, 2)}</span>}
  </span>;
}

function PlanningConnectionLabelField({ edge, otherNodeName, onCommit }) {
  const [draft, setDraft] = useState(edge.label || '');

  useEffect(() => {
    setDraft(edge.label || '');
  }, [edge.id, edge.label]);

  const commit = () => {
    const normalized = draft.trim();
    setDraft(normalized);
    onCommit(edge.id, normalized);
  };

  return <label className={styles.connectionLabelField}>
    <span>Connection label</span>
    <input
      value={draft}
      maxLength={MAX_PLANNING_CONNECTION_LABEL_LENGTH}
      placeholder="e.g. sends HTTPS traffic"
      aria-label={`Connection label with ${otherNodeName || 'service'}`}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
    />
  </label>;
}

export default function PlanningWorkspace({ planning }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const {
    planningDocument,
    nodes,
    edges,
    canvasZoom,
    canvasPan,
    feedback,
    lastSavedAt,
    setNodes,
    setEdges,
    setCanvasZoom,
    setCanvasPan,
    renameDocument,
    createNewArchitecture,
    importArchitecture,
    exportArchitecture,
    librarySummaries,
    openArchitecture,
    deleteArchitecture,
    undo,
    redo,
    canUndo,
    canRedo
  } = planning;
  const [selectedId, setSelectedId] = useState(null);
  const [canvasTool, setCanvasTool] = useState('select');
  const [connectionDrag, setConnectionDrag] = useState(null);
  const [keyboardConnectionSource, setKeyboardConnectionSource] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [nodePreview, setNodePreview] = useState(null);
  const [panPreview, setPanPreview] = useState(null);
  const [paletteWidth, setPaletteWidth] = useState(252);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [removalHover, setRemovalHover] = useState(false);
  const [nameDraft, setNameDraft] = useState(planningDocument.name);
  const canvasRef = useRef(null);
  const canvasZoomRef = useRef(canvasZoom);
  const canvasPanRef = useRef(canvasPan);
  const importInputRef = useRef(null);
  const nodeInteractionRef = useRef(null);
  const canvasPanInteractionRef = useRef(null);
  const canvasPanDidMoveRef = useRef(false);
  const paletteResizeRef = useRef(null);
  const categoryPickerRef = useRef(null);
  const documentPickerRef = useRef(null);
  const documentPickerTriggerRef = useRef(null);
  const paletteRef = useRef(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false);
  useEffect(() => () => {
    if (nodeInteractionRef.current?.frame != null) window.cancelAnimationFrame(nodeInteractionRef.current.frame);
    if (canvasPanInteractionRef.current?.frame != null) window.cancelAnimationFrame(canvasPanInteractionRef.current.frame);
  }, []);
  canvasZoomRef.current = canvasZoom;
  canvasPanRef.current = panPreview || canvasPan;
  const categories = ['All', ...new Set(PLANNING_SERVICES.map((service) => service.category))];
  const query = search.trim().toLowerCase();
  const availableServices = PLANNING_SERVICES.filter((service) => (selectedCategory === 'All' || service.category === selectedCategory) && (!query || service.name.toLowerCase().includes(query)));
  const displayNodes = nodePreview ? nodes.map((node) => node.id === nodePreview.id ? { ...node, ...nodePreview } : node) : nodes;
  const displayNodeById = new Map(displayNodes.map((node) => [node.id, node]));
  const displayPan = panPreview || canvasPan;
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedNodeService = selectedNode ? PLANNING_SERVICES.find((service) => service.key === selectedNode.serviceKey) : null;
  const selectedServiceDetails = selectedNode ? PLANNING_SERVICE_DETAILS[selectedNode.serviceKey] : null;
  const selectedConnections = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const drawingSource = nodes.find((node) => node.id === connectionDrag?.sourceId);
  const drawingTarget = nodes.find((node) => node.id === connectionDrag?.targetId);
  const previewConnection = drawingSource && connectionDrag?.point ? (() => {
    const sourceCenter = { x: drawingSource.x + (drawingSource.width || DEFAULT_PLANNING_NODE_WIDTH) / 2, y: drawingSource.y + (drawingSource.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 };
    const targetCenter = drawingTarget
      ? { x: drawingTarget.x + (drawingTarget.width || DEFAULT_PLANNING_NODE_WIDTH) / 2, y: drawingTarget.y + (drawingTarget.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 }
      : connectionDrag.point;
    const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
    const sourceScale = Math.min(
      (drawingSource.width || DEFAULT_PLANNING_NODE_WIDTH) / 2 / Math.max(1, Math.abs(delta.x)),
      (drawingSource.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 / Math.max(1, Math.abs(delta.y))
    );
    const targetScale = drawingTarget ? Math.min(
      (drawingTarget.width || DEFAULT_PLANNING_NODE_WIDTH) / 2 / Math.max(1, Math.abs(delta.x)),
      (drawingTarget.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 / Math.max(1, Math.abs(delta.y))
    ) : 0;
    return {
      x1: sourceCenter.x + delta.x * sourceScale,
      y1: sourceCenter.y + delta.y * sourceScale,
      x2: targetCenter.x - delta.x * targetScale,
      y2: targetCenter.y - delta.y * targetScale
    };
  })() : null;
  const libraryOptions = librarySummaries.some((summary) => summary.id === planningDocument.id)
    ? librarySummaries
    : [{
        id: planningDocument.id,
        name: planningDocument.name,
        updatedAt: planningDocument.updatedAt,
        nodeCount: nodes.length,
        edgeCount: edges.length
      }, ...librarySummaries];
  const selectedArchitecture = libraryOptions.find((summary) => summary.id === planningDocument.id) || {
    name: planningDocument.name,
    nodeCount: nodes.length,
    edgeCount: edges.length
  };

  useEffect(() => {
    setNameDraft(planningDocument.name);
    setSelectedId(null);
    setConnectionDrag(null);
    setKeyboardConnectionSource(null);
    setNodePreview(null);
    setPanPreview(null);
  }, [planningDocument.id, planningDocument.name]);

  const commitDocumentName = () => {
    if (!renameDocument(nameDraft)) setNameDraft(planningDocument.name);
  };

  const handleDocumentMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDocumentMenuOpen(false);
      documentPickerTriggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [...(documentPickerRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    if (!options.length) return;
    event.preventDefault();
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  const exportArchitectureSvg = () => {
    const artifact = createPlanningSvgArtifact(planningDocument, PLANNING_SERVICES);
    downloadPlanningSvgArtifact(artifact);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      importArchitecture(await file.text(), file.name);
    } catch (error) {
      importArchitecture('', `${file.name} (${error.message})`);
    }
  };

  const handleCanvasWheel = useCallback((event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = getWheelZoomFactor(event);
    if (factor === 1) return;
    event.preventDefault();
    const nextViewport = getZoomedCanvasViewport({
      zoom: canvasZoomRef.current,
      pan: canvasPanRef.current,
      cursor: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      },
      factor,
      minZoom: MIN_PLANNING_ZOOM,
      maxZoom: MAX_PLANNING_ZOOM,
      viewport: { width: rect.width, height: rect.height },
      canvasSize: PLANNING_CANVAS_SIZE
    });
    if (nextViewport.zoom === canvasZoomRef.current) return;
    canvasZoomRef.current = nextViewport.zoom;
    canvasPanRef.current = nextViewport.pan;
    setCanvasZoom(Number(nextViewport.zoom.toFixed(3)));
    setCanvasPan({
      x: Number(nextViewport.pan.x.toFixed(2)),
      y: Number(nextViewport.pan.y.toFixed(2))
    });
  }, [setCanvasPan, setCanvasZoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleCanvasWheel);
  }, [handleCanvasWheel]);

  useEffect(() => {
    if (!categoryMenuOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!categoryPickerRef.current?.contains(event.target)) setCategoryMenuOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutsidePress);
    return () => window.removeEventListener('mousedown', closeOnOutsidePress);
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!documentMenuOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!documentPickerRef.current?.contains(event.target)) setDocumentMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePress);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [documentMenuOpen]);

  useEffect(() => {
    if (!documentMenuOpen) return;
    documentPickerRef.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [documentMenuOpen]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const direction = getKeyboardZoomDirection(event);
      if (direction) {
        event.preventDefault();
        setCanvasZoom((zoom) => Math.min(MAX_PLANNING_ZOOM, Math.max(MIN_PLANNING_ZOOM, Number((zoom + direction * 0.1).toFixed(2)))));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        setCanvasZoom(DEFAULT_PLANNING_ZOOM);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const placeService = useCallback((service, point) => {
    const id = `${service.key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNodes((current) => [...current, {
      id,
      serviceKey: service.key,
      x: Math.max(18, Math.min(PLANNING_CANVAS_SIZE - DEFAULT_PLANNING_NODE_WIDTH - 18, point.x)),
      y: Math.max(18, Math.min(PLANNING_CANVAS_SIZE - DEFAULT_PLANNING_NODE_HEIGHT - 18, point.y)),
      width: DEFAULT_PLANNING_NODE_WIDTH,
      height: DEFAULT_PLANNING_NODE_HEIGHT,
      name: service.name
    }]);
    setSelectedId(id);
  }, []);

  const handleDrop = (event) => {
    event.preventDefault();
    const key = event.dataTransfer.getData('application/aws-service');
    const service = PLANNING_SERVICES.find((item) => item.key === key);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (service && rect) placeService(service, {
      x: (event.clientX - rect.left - displayPan.x) / canvasZoom - (DEFAULT_PLANNING_NODE_WIDTH / 2),
      y: (event.clientY - rect.top - displayPan.y) / canvasZoom - (DEFAULT_PLANNING_NODE_HEIGHT / 2)
    });
  };

  const addConnection = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setEdges((current) => current.some((edge) => edge.source === sourceId && edge.target === targetId)
      ? current
      : [...current, { id: `${sourceId}-${targetId}`, source: sourceId, target: targetId }]);
  };

  const canvasPointFromClient = (clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (clientX - rect.left - canvasPanRef.current.x) / canvasZoomRef.current,
      y: (clientY - rect.top - canvasPanRef.current.y) / canvasZoomRef.current
    };
  };

  const connectionTargetAt = (clientX, clientY, sourceId) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest('[data-planning-node-id]');
    const targetId = element && canvasRef.current?.contains(element) ? element.dataset.planningNodeId : null;
    return targetId && targetId !== sourceId ? targetId : null;
  };

  const handleNodeClick = (event, node) => {
    event.stopPropagation();
    if (canvasTool === 'select') setSelectedId(node.id);
  };

  const handleNodeKeyDown = (event, node) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (canvasTool === 'select') {
      setSelectedId(node.id);
      return;
    }
    if (keyboardConnectionSource && keyboardConnectionSource !== node.id) {
      addConnection(keyboardConnectionSource, node.id);
      setKeyboardConnectionSource(null);
    } else {
      setKeyboardConnectionSource((current) => current === node.id ? null : node.id);
    }
  };

  const beginConnectionDrag = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setKeyboardConnectionSource(null);
    setSelectedId(node.id);
    setConnectionDrag({ sourceId: node.id, pointerId: event.pointerId, point: canvasPointFromClient(event.clientX, event.clientY), targetId: null });
  };

  const moveConnectionDrag = (event) => {
    setConnectionDrag((current) => current?.pointerId === event.pointerId ? {
      ...current,
      point: canvasPointFromClient(event.clientX, event.clientY),
      targetId: connectionTargetAt(event.clientX, event.clientY, current.sourceId)
    } : current);
  };

  const endConnectionDrag = (event, cancelled = false) => {
    if (!connectionDrag || connectionDrag.pointerId !== event.pointerId) return;
    if (!cancelled) addConnection(connectionDrag.sourceId, connectionTargetAt(event.clientX, event.clientY, connectionDrag.sourceId));
    setConnectionDrag(null);
  };

  const beginDrag = (event, node) => {
    if (event.button !== 0) return;
    if (canvasTool === 'draw') {
      beginConnectionDrag(event, node);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    nodeInteractionRef.current = {
      type: 'drag',
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      startWidth: node.width || DEFAULT_PLANNING_NODE_WIDTH,
      startHeight: node.height || DEFAULT_PLANNING_NODE_HEIGHT,
      paletteBounds: paletteRef.current?.getBoundingClientRect(),
      latest: null,
      frame: null
    };
    setDraggingId(node.id);
  };

  const beginNodeResize = (event, node) => {
    if (event.button !== 0) return;
    if (canvasTool === 'draw') { event.stopPropagation(); return; }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    nodeInteractionRef.current = {
      type: 'resize',
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      startWidth: node.width || DEFAULT_PLANNING_NODE_WIDTH,
      startHeight: node.height || DEFAULT_PLANNING_NODE_HEIGHT,
      latest: null,
      frame: null
    };
    setSelectedId(node.id);
  };

  const moveNode = (event) => {
    const interaction = nodeInteractionRef.current;
    if (!interaction || !canvasRef.current) return;
    const paletteBounds = interaction.paletteBounds;
    const overRemovalZone = interaction.type === 'drag' && Boolean(paletteBounds && event.clientX >= paletteBounds.left && event.clientX <= paletteBounds.right && event.clientY >= paletteBounds.top && event.clientY <= paletteBounds.bottom);
    setRemovalHover((current) => current === overRemovalZone ? current : overRemovalZone);
    const deltaX = (event.clientX - interaction.startClientX) / canvasZoomRef.current;
    const deltaY = (event.clientY - interaction.startClientY) / canvasZoomRef.current;
    const preview = interaction.type === 'resize' ? {
      id: interaction.id,
      width: Math.max(MIN_PLANNING_NODE_WIDTH, Math.min(PLANNING_CANVAS_SIZE - interaction.startX - 10, interaction.startWidth + deltaX)),
      height: Math.max(MIN_PLANNING_NODE_HEIGHT, Math.min(PLANNING_CANVAS_SIZE - interaction.startY - 10, interaction.startHeight + deltaY))
    } : {
      id: interaction.id,
      x: Math.max(10, Math.min(PLANNING_CANVAS_SIZE - interaction.startWidth - 10, interaction.startX + deltaX)),
      y: Math.max(10, Math.min(PLANNING_CANVAS_SIZE - interaction.startHeight - 10, interaction.startY + deltaY))
    };
    interaction.latest = preview;
    if (interaction.frame == null) interaction.frame = window.requestAnimationFrame(() => {
      interaction.frame = null;
      if (nodeInteractionRef.current === interaction) setNodePreview(interaction.latest);
    });
  };

  const endNodeInteraction = (event, cancelled = false) => {
    const interaction = nodeInteractionRef.current;
    if (!interaction) return;
    if (interaction.frame != null) window.cancelAnimationFrame(interaction.frame);
    const paletteBounds = interaction.paletteBounds;
    const droppedInPalette = !cancelled && interaction.type === 'drag' && event && paletteBounds && event.clientX >= paletteBounds.left && event.clientX <= paletteBounds.right && event.clientY >= paletteBounds.top && event.clientY <= paletteBounds.bottom;
    if (droppedInPalette) {
      setNodes((current) => current.filter((node) => node.id !== interaction.id));
      setEdges((current) => current.filter((edge) => edge.source !== interaction.id && edge.target !== interaction.id));
      setSelectedId((current) => current === interaction.id ? null : current);
      setKeyboardConnectionSource((current) => current === interaction.id ? null : current);
    } else if (!cancelled && interaction.latest && (interaction.type === 'drag'
      ? interaction.latest.x !== interaction.startX || interaction.latest.y !== interaction.startY
      : interaction.latest.width !== interaction.startWidth || interaction.latest.height !== interaction.startHeight)) {
      setNodes((current) => current.map((node) => node.id === interaction.id ? { ...node, ...interaction.latest } : node));
    }
    nodeInteractionRef.current = null;
    setNodePreview(null);
    setRemovalHover(false);
    setDraggingId(null);
  };

  const beginCanvasPan = (event) => {
    if (event.button !== 0 || event.target.closest('[data-planning-node]')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasPanInteractionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: canvasPanRef.current.x,
      startY: canvasPanRef.current.y,
      bounds: canvasRef.current?.getBoundingClientRect(),
      latest: null,
      frame: null
    };
    canvasPanDidMoveRef.current = false;
    setIsCanvasPanning(true);
  };

  const moveCanvasPan = (event) => {
    const interaction = canvasPanInteractionRef.current;
    const rect = interaction?.bounds;
    if (!interaction || !rect) return;
    const minX = Math.min(0, rect.width - PLANNING_CANVAS_SIZE * canvasZoomRef.current);
    const minY = Math.min(0, rect.height - PLANNING_CANVAS_SIZE * canvasZoomRef.current);
    if (Math.abs(event.clientX - interaction.startClientX) > 2 || Math.abs(event.clientY - interaction.startClientY) > 2) canvasPanDidMoveRef.current = true;
    interaction.latest = {
      x: Math.min(0, Math.max(minX, interaction.startX + event.clientX - interaction.startClientX)),
      y: Math.min(0, Math.max(minY, interaction.startY + event.clientY - interaction.startClientY))
    };
    canvasPanRef.current = interaction.latest;
    if (interaction.frame == null) interaction.frame = window.requestAnimationFrame(() => {
      interaction.frame = null;
      if (canvasPanInteractionRef.current === interaction) setPanPreview(interaction.latest);
    });
  };

  const endCanvasPan = (cancelled = false) => {
    const interaction = canvasPanInteractionRef.current;
    if (!interaction) return;
    if (interaction.frame != null) window.cancelAnimationFrame(interaction.frame);
    if (!cancelled && interaction.latest && (interaction.latest.x !== interaction.startX || interaction.latest.y !== interaction.startY)) setCanvasPan(interaction.latest);
    else canvasPanRef.current = canvasPan;
    canvasPanInteractionRef.current = null;
    setPanPreview(null);
    setIsCanvasPanning(false);
  };

  const handleCanvasClick = () => {
    if (canvasPanDidMoveRef.current) {
      canvasPanDidMoveRef.current = false;
      return;
    }
    setSelectedId(null);
    setKeyboardConnectionSource(null);
  };

  const resizeSelectedNodeByKeyboard = (event, node) => {
    const step = event.shiftKey ? 24 : 8;
    const changes = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowDown: [0, step],
      ArrowUp: [0, -step]
    };
    if (!changes[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    const [widthDelta, heightDelta] = changes[event.key];
    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      width: Math.max(MIN_PLANNING_NODE_WIDTH, Math.min(PLANNING_CANVAS_SIZE - item.x - 10, (item.width || DEFAULT_PLANNING_NODE_WIDTH) + widthDelta)),
      height: Math.max(MIN_PLANNING_NODE_HEIGHT, Math.min(PLANNING_CANVAS_SIZE - item.y - 10, (item.height || DEFAULT_PLANNING_NODE_HEIGHT) + heightDelta))
    } : item));
  };

  const beginPaletteResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    paletteResizeRef.current = { startClientX: event.clientX, startWidth: paletteWidth };
  };

  const movePaletteResize = (event) => {
    if (!paletteResizeRef.current) return;
    setPaletteWidth(Math.max(190, Math.min(420, paletteResizeRef.current.startWidth + event.clientX - paletteResizeRef.current.startClientX)));
  };

  const endPaletteResize = () => {
    paletteResizeRef.current = null;
  };

  const resizePaletteByKeyboard = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 16;
    setPaletteWidth((current) => Math.max(190, Math.min(420, current + (event.key === 'ArrowRight' ? step : -step))));
  };

  const renameSelectedNode = (name) => {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, name } : node));
  };

  const removeNode = useCallback((nodeId) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedId((current) => current === nodeId ? null : current);
    setKeyboardConnectionSource((current) => current === nodeId ? null : current);
    setConnectionDrag((current) => current?.sourceId === nodeId || current?.targetId === nodeId ? null : current);
  }, [setEdges, setNodes]);

  const removeEdge = useCallback((edgeId) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  const updateConnectionLabel = useCallback((edgeId, label) => {
    setEdges((current) => updatePlanningConnectionLabel(current, edgeId, label));
  }, [setEdges]);

  useEffect(() => {
    const handlePlanningShortcut = (event) => {
      const target = event.target;
      const isDocumentMenuItem = target instanceof HTMLElement && target.closest('[role="menuitemradio"]');
      const isUndoRedoShortcut = (event.ctrlKey || event.metaKey)
        && ['z', 'y'].includes(event.key.toLowerCase());
      if (isDocumentMenuItem && !isUndoRedoShortcut) return;
      if (event.key === 'Escape' && canvasTool === 'draw') {
        setCanvasTool('select');
        setConnectionDrag(null);
        setKeyboardConnectionSource(null);
        return;
      }
      const isEditing = target instanceof HTMLElement
        && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      if (isEditing) return;

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (!modifier && selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        removeNode(selectedId);
      }
    };
    window.addEventListener('keydown', handlePlanningShortcut);
    return () => window.removeEventListener('keydown', handlePlanningShortcut);
  }, [canvasTool, redo, removeNode, selectedId, undo]);

  return <>
    <div className={styles.planningToolbar}>
      <div><span className={styles.planningEyebrow}>Architecture workspace</span><h1>Design your AWS architecture</h1><p>Drag services onto the canvas, arrange them, then connect the flow.</p></div>
      <div className={styles.planningActions}>
        <div className={`${styles.documentPicker} ${documentMenuOpen ? styles.documentPickerOpen : ''}`} ref={documentPickerRef}>
          <span className={styles.documentPickerLabel}>Architecture</span>
          <button
            className={styles.documentPickerTrigger}
            type="button"
            ref={documentPickerTriggerRef}
            aria-label={`Open architecture. Current: ${selectedArchitecture.name}, ${selectedArchitecture.nodeCount} ${selectedArchitecture.nodeCount === 1 ? 'service' : 'services'}`}
            aria-expanded={documentMenuOpen}
            aria-haspopup="menu"
            aria-controls={documentMenuOpen ? 'architecture-menu' : undefined}
            title={`${selectedArchitecture.name} · ${selectedArchitecture.nodeCount} service${selectedArchitecture.nodeCount === 1 ? '' : 's'}`}
            onClick={() => setDocumentMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (!documentMenuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                setDocumentMenuOpen(true);
              }
            }}
          >
            <span className={styles.documentPickerGlyph}><Icon name="layers" size={15} /></span>
            <span className={styles.documentPickerName}>{selectedArchitecture.name}</span>
            <span className={styles.documentPickerCount}>{selectedArchitecture.nodeCount} service{selectedArchitecture.nodeCount === 1 ? '' : 's'}</span>
            <Icon name="chevronDown" size={15} />
          </button>
          {documentMenuOpen ? <div
            className={styles.documentMenu}
            id="architecture-menu"
            role="menu"
            aria-label="Saved architectures"
            onKeyDown={handleDocumentMenuKeyDown}
          >
            <div className={styles.documentMenuHeader} role="presentation"><span>Saved architectures</span><small>{libraryOptions.length}</small></div>
            <div className={styles.documentMenuList} role="group" aria-label="Architecture choices">
              {libraryOptions.map((summary) => {
                const isCurrent = summary.id === planningDocument.id;
                const serviceCount = summary.nodeCount ?? 0;
                const connectionCount = summary.edgeCount ?? 0;
                return <button
                  key={summary.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  aria-label={`${summary.name}, ${serviceCount} services, ${connectionCount} connections${isCurrent ? ', current architecture' : ''}`}
                  className={`${styles.documentMenuOption} ${isCurrent ? styles.documentMenuOptionCurrent : ''}`}
                  title={summary.name}
                  onClick={() => {
                    openArchitecture(summary.id);
                    setDocumentMenuOpen(false);
                    documentPickerTriggerRef.current?.focus();
                  }}
                >
                  <span className={styles.documentMenuOptionGlyph}><Icon name="layers" size={16} /></span>
                  <span className={styles.documentMenuOptionText}>
                    <strong>{summary.name}</strong>
                    <small>{serviceCount} service{serviceCount === 1 ? '' : 's'} <i>·</i> {connectionCount} connection{connectionCount === 1 ? '' : 's'}</small>
                  </span>
                  <span className={styles.documentMenuOptionCheck} aria-hidden="true">{isCurrent ? <Icon name="check" size={15} /> : null}</span>
                </button>;
              })}
            </div>
          </div> : null}
        </div>
        <button className={styles.secondaryBtn} type="button" onClick={createNewArchitecture}><Icon name="plus" size={15} /> New architecture</button>
        <button className={styles.secondaryBtn} type="button" onClick={() => importInputRef.current?.click()}><Icon name="upload" size={15} /> Import</button>
        <input ref={importInputRef} className={styles.hiddenFileInput} type="file" accept=".json,.awsome.json,.graphivo.json,application/json" onChange={handleImportFile} tabIndex={-1} />
        <button className={styles.secondaryBtn} type="button" onClick={exportArchitecture}><Icon name="download" size={15} /> Export</button>
        <button className={styles.secondaryBtn} type="button" onClick={exportArchitectureSvg}><Icon name="download" size={15} /> Export SVG</button>
        <button className={styles.secondaryBtn} type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Icon name="undo" size={15} /> Undo</button>
        <button className={styles.secondaryBtn} type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={15} /> Redo</button>
        <button className={styles.secondaryBtn} type="button" onClick={() => deleteArchitecture(planningDocument.id)} title="Delete this architecture"><Icon name="trash" size={14} /> Delete</button>
        <span className={styles.nodeCount}>{nodes.length} service{nodes.length === 1 ? '' : 's'} placed</span>
      </div>
    </div>
    {feedback ? <div className={`${styles.planningFeedback} ${styles[`planningFeedback${feedback.type.charAt(0).toUpperCase()}${feedback.type.slice(1)}`]}`} role={feedback.type === 'error' ? 'alert' : 'status'}><Icon name={feedback.type === 'error' ? 'info' : 'layers'} size={14} /><span>{feedback.text}</span></div> : null}
    <div className={styles.planningLayout} style={{ '--palette-width': `${paletteWidth}px` }}>
      <aside ref={paletteRef} className={`${styles.servicePalette} ${removalHover ? styles.servicePaletteRemovalTarget : ''}`} aria-label="AWS service palette">
        {removalHover ? <div className={styles.removalDropHint}>Release to remove from diagram</div> : null}
        <div className={styles.paletteHeader}><div><span className={styles.panelKicker}>AWS service library</span><h2>Build with AWS</h2></div><span className={styles.libraryCount}>{PLANNING_SERVICES.length}</span></div>
        <label className={styles.searchBox}><Icon name="search" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services" aria-label="Search AWS services" /></label>
        <div className={styles.categoryPicker} ref={categoryPickerRef}><span>Service type</span><button type="button" className={styles.categoryPickerTrigger} aria-expanded={categoryMenuOpen} aria-haspopup="listbox" onClick={() => setCategoryMenuOpen((open) => !open)}><span>{selectedCategory === 'All' ? 'All services' : selectedCategory}</span><Icon name="chevronDown" size={15} /></button>{categoryMenuOpen ? <div className={styles.categoryMenu} role="listbox" aria-label="Filter AWS services by type"><button type="button" role="option" aria-selected={selectedCategory === 'All'} className={selectedCategory === 'All' ? styles.categoryOptionActive : ''} onClick={() => { setSelectedCategory('All'); setCategoryMenuOpen(false); }}><i />All services</button>{categories.slice(1).map((category) => <button type="button" role="option" aria-selected={selectedCategory === category} className={selectedCategory === category ? styles.categoryOptionActive : ''} key={category} onClick={() => { setSelectedCategory(category); setCategoryMenuOpen(false); }}><i />{category}</button>)}</div> : null}</div>
        <div className={styles.serviceList}>{availableServices.map((service) => <button key={service.key} type="button" className={styles.serviceCard} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/aws-service', service.key); }} onClick={() => placeService(service, { x: 120 + (nodes.length % 3) * 210, y: 120 + (nodes.length % 4) * 110 })}><PlanningServiceIcon service={service} small /><span><strong>{service.name}</strong><small>{service.category}</small></span><Icon name="cursor" size={14} /></button>)}</div>
        <div
          className={styles.paletteResizeHandle}
          role="separator"
          aria-label="Resize AWS service library"
          aria-orientation="vertical"
          aria-valuemin="190"
          aria-valuemax="420"
          aria-valuenow={Math.round(paletteWidth)}
          tabIndex={0}
          onPointerDown={beginPaletteResize}
          onPointerMove={movePaletteResize}
          onPointerUp={endPaletteResize}
          onPointerCancel={endPaletteResize}
          onKeyDown={resizePaletteByKeyboard}
          title="Drag left or right to resize the service library"
        ><Icon name="resizeHorizontal" size={15} /></div>
      </aside>
      <section className={styles.planningCanvasPanel} aria-label="AWS architecture canvas">
        <div className={styles.planningCanvasTop}><div className={styles.canvasTitle}><Icon name="layers" size={15} /><input aria-label="Architecture name" title="Rename architecture" maxLength={120} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitDocumentName} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setNameDraft(planningDocument.name); event.currentTarget.blur(); } }} /><small>{feedback?.text === 'Saving changes…' ? 'Saving' : lastSavedAt ? 'Saved' : 'Draft'}</small></div><div className={styles.canvasMeta}><div className={styles.planningToolSwitch} role="group" aria-label="Canvas tools"><button type="button" aria-pressed={canvasTool === 'select'} className={canvasTool === 'select' ? styles.planningToolActive : ''} onClick={() => { setCanvasTool('select'); setConnectionDrag(null); setKeyboardConnectionSource(null); }} title="Select and move services"><Icon name="cursor" size={15} />Select</button><button type="button" aria-pressed={canvasTool === 'draw'} className={canvasTool === 'draw' ? styles.planningToolActive : ''} onClick={() => { setCanvasTool('draw'); setConnectionDrag(null); setKeyboardConnectionSource(null); }} title="Draw a connection by dragging between services"><Icon name="pen" size={15} />Draw</button></div><span className={styles.zoomHint}>{Math.round(canvasZoom * 100)}% · Scroll to zoom</span></div></div>
        <div className={`${styles.planningCanvas} ${isCanvasPanning ? styles.planningCanvasPanning : ''} ${canvasTool === 'draw' ? styles.planningCanvasDrawing : ''}`} ref={canvasRef} onPointerDown={beginCanvasPan} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onPointerMove={(event) => { moveCanvasPan(event); moveNode(event); moveConnectionDrag(event); }} onPointerUp={(event) => { endCanvasPan(); endNodeInteraction(event); endConnectionDrag(event); }} onPointerCancel={(event) => { endCanvasPan(true); endNodeInteraction(event, true); endConnectionDrag(event, true); }} onClick={handleCanvasClick}>
          <div className={styles.planningCanvasSurface} style={{ '--canvas-zoom': canvasZoom, '--canvas-pan-x': `${displayPan.x}px`, '--canvas-pan-y': `${displayPan.y}px` }}>
          <div className={styles.canvasGrid} />
          {edges.length || previewConnection ? <svg className={styles.connectionLayer} aria-hidden="true">
            <defs><marker id="planning-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker><marker id="planning-preview-arrow" className={styles.previewMarker} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            {edges.map((edge) => {
              const source = displayNodeById.get(edge.source);
              const target = displayNodeById.get(edge.target);
              if (!source || !target) return null;
              const sourceCenter = { x: source.x + (source.width || DEFAULT_PLANNING_NODE_WIDTH) / 2, y: source.y + (source.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 };
              const targetCenter = { x: target.x + (target.width || DEFAULT_PLANNING_NODE_WIDTH) / 2, y: target.y + (target.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 };
              const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
              const sourceScale = Math.min(
                (source.width || DEFAULT_PLANNING_NODE_WIDTH) / 2 / Math.max(1, Math.abs(delta.x)),
                (source.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 / Math.max(1, Math.abs(delta.y))
              );
              const targetScale = Math.min(
                (target.width || DEFAULT_PLANNING_NODE_WIDTH) / 2 / Math.max(1, Math.abs(delta.x)),
                (target.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2 / Math.max(1, Math.abs(delta.y))
              );
              const x1 = sourceCenter.x + (delta.x * sourceScale);
              const y1 = sourceCenter.y + (delta.y * sourceScale);
              const x2 = targetCenter.x - (delta.x * targetScale);
              const y2 = targetCenter.y - (delta.y * targetScale);
              return <g key={edge.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                {edge.label ? <text x={(sourceCenter.x + targetCenter.x) / 2} y={(sourceCenter.y + targetCenter.y) / 2 - 7}>{edge.label}</text> : null}
              </g>;
            })}
            {previewConnection ? <line className={styles.connectionPreview} {...previewConnection} /> : null}
          </svg> : null}
          {!nodes.length ? <div className={styles.planningEmpty}><span><Icon name="cursor" size={27} /></span><h2>Start with a service</h2><p>Choose an AWS service from the library and drag it here to start mapping your system.</p></div> : null}
          {displayNodes.map((node) => <div
            key={node.id}
            role="button"
            tabIndex={0}
            data-planning-node="true"
            data-planning-node-id={node.id}
            aria-label={`${node.name} architecture node`}
            className={`${styles.planningNode} ${selectedId === node.id ? styles.planningNodeSelected : ''} ${connectionDrag?.sourceId === node.id || keyboardConnectionSource === node.id ? styles.planningNodeSource : ''} ${connectionDrag?.targetId === node.id ? styles.planningNodeTarget : ''} ${draggingId === node.id ? styles.planningNodeDragging : ''}`}
            style={{ left: node.x, top: node.y, width: node.width || DEFAULT_PLANNING_NODE_WIDTH, height: node.height || DEFAULT_PLANNING_NODE_HEIGHT, ...getPlanningNodeVisualStyle(node) }}
            onPointerDown={(event) => beginDrag(event, node)}
            onClick={(event) => handleNodeClick(event, node)}
            onKeyDown={(event) => handleNodeKeyDown(event, node)}
          >
            <PlanningServiceIcon service={PLANNING_SERVICES.find((service) => service.key === node.serviceKey)} /><span>{node.name}</span>
            <span
              className={styles.nodeResizeHandle}
              role="button"
              tabIndex={0}
              aria-label={`Resize ${node.name}`}
              title="Drag to resize this service box"
              onPointerDown={(event) => beginNodeResize(event, node)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => resizeSelectedNodeByKeyboard(event, node)}
            ><Icon name="resizeDiagonal" size={15} /></span>
          </div>)}
          </div>
          <div className={`${styles.connectionHelper} ${canvasTool === 'draw' ? styles.connectionHelperDrawing : ''}`} role="status">{canvasTool === 'draw' ? keyboardConnectionSource ? 'Press Enter on another service to connect' : 'Drag between services to connect · Enter works with a keyboard' : 'Drag boxes to arrange them · choose Draw to connect'}</div>
        </div>
      </section>
      <aside className={styles.planningInspector} aria-label="Architecture details">
        {selectedNode && selectedNodeService ? <>
          <span className={styles.panelKicker}>{selectedNode.provenance ? 'Imported AWS resource' : 'AWS service details'}</span>
          <PlanningServiceIcon service={selectedNodeService} />
          <label className={styles.nodeNameField}><span>Display name</span><input value={selectedNode.name} onChange={(event) => renameSelectedNode(event.target.value)} aria-label="Planning node display name" /></label>
          <p>{selectedServiceDetails?.[0] || 'AWS managed service selected for this architecture.'}</p>
          <div className={styles.realWorldUse}><span>Common use</span><p>{selectedServiceDetails?.[1] || 'Use this service as part of your planned AWS workload.'}</p></div>
          <dl>
            {selectedNode.provenance ? <><div><dt>Provenance</dt><dd>Imported from live topology</dd></div><div><dt>Original label</dt><dd>{selectedNode.originalResourceLabel}</dd></div><div><dt>Resource ID</dt><dd>{selectedNode.resourceId}</dd></div><div><dt>Live resource type</dt><dd>{selectedNode.liveResourceType}</dd></div><div><dt>Profile</dt><dd>{selectedNode.profile}</dd></div><div><dt>Region</dt><dd>{selectedNode.region}</dd></div></> : null}
            <div><dt>Category</dt><dd>{selectedNodeService.category}</dd></div>
            <div><dt>Connections</dt><dd>{edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</dd></div>
          </dl>
          {selectedConnections.length ? <div className={styles.connectionList}><span>Connected relationships</span>{selectedConnections.map((edge) => {
            const otherNode = nodes.find((node) => node.id === (edge.source === selectedNode.id ? edge.target : edge.source));
            return <div key={edge.id} className={styles.connectionItem}><div><span>{edge.source === selectedNode.id ? 'To' : 'From'} {otherNode?.name || 'service'}</span><button type="button" onClick={() => removeEdge(edge.id)} aria-label={`Remove connection with ${otherNode?.name || 'service'}`} title="Remove connection"><Icon name="close" size={13} /></button></div><PlanningConnectionLabelField edge={edge} otherNodeName={otherNode?.name} onCommit={updateConnectionLabel} /></div>;
          })}</div> : null}
          <button className={styles.dangerBtn} type="button" onClick={() => removeNode(selectedNode.id)}><Icon name="trash" size={14} /> Remove service</button>
        </> : <div className={styles.plannerInspectorEmpty}><span><Icon name="grid" size={20} /></span><h2>Architecture details</h2><p>Select a service in the canvas to see what it does and how it is commonly used in a real AWS workload.</p></div>}
      </aside>
    </div>
  </>;
}
