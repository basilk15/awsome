import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareTopologySnapshots, snapshotChangeCount, snapshotUncertainCount } from './liveSnapshots.mjs';
import { graphRegions, normaliseScanRegions, sameScanSource } from './liveRegions.mjs';
import styles from '../styles/Home.module.css';
import Landing from './Landing';
import Icon from './Icon';
import PlanningWorkspace from './PlanningWorkspace';
import { PLANNING_SERVICES, SERVICE_MAP } from './serviceCatalog';
import logo from '../docs/assets/awsome-logo-transparent.png';
import { canShowLiveEdgeLabel, getKeyboardZoomDirection, getLiveCanvasAutoPanDelta, getLiveEdgeDisplayLabel, getWheelZoomFactor } from './liveCanvas.mjs';
import { filterLiveTopologyGraph } from './liveTopologyFilter.mjs';
import { DEFAULT_PLANNING_ZOOM } from './planningDocument.mjs';
import usePlanningDocument from './usePlanningDocument';
import {
  convertLiveTopologyToPlan,
  mergePlanningGraphs
} from './planning/liveTopology.mjs';

const EDGE_TEXT_BY_RELATION = {
  'vpc->subnet': 'Subnet belongs to VPC',
  'vpc->sg': 'Security group belongs to VPC',
  'subnet->ec2': 'EC2 hosted in Subnet',
  'ec2->sg': 'Security Group attached to EC2',
  'subnet->rds': 'RDS associated with Subnet Group',
  'rds->sg': 'Security Group attached to RDS',
  'vpc->igw': 'Internet Gateway attached to VPC',
  'vpc->nat': 'NAT Gateway belongs to VPC',
  'subnet->nat': 'NAT Gateway placed in Subnet',
  'vpc->route_table': 'Route Table belongs to VPC',
  'route_table->subnet': 'Route Table applies to Subnet',
  'route_table->igw': 'Route sends traffic to Internet Gateway',
  'route_table->nat': 'Route sends traffic to NAT Gateway',
  'route_table->ec2': 'Route sends traffic to EC2 instance',
  'route_table->vpc_endpoint': 'Route sends traffic to VPC Endpoint',
  'route_table->vpc_peering': 'Route sends traffic to VPC Peering Connection',
  'route_table->egress_only_igw': 'Route sends IPv6 traffic to Egress-only Internet Gateway',
  'route_table->transit_gateway': 'Route sends traffic to Transit Gateway',
  'vpc->vpc_endpoint': 'VPC contains Endpoint',
  'vpc->vpc_peering': 'VPC requests Peering Connection',
  'vpc_peering->vpc': 'Peering Connection accepted by VPC',
  'vpc->egress_only_igw': 'Egress-only Internet Gateway attached to VPC',
  'transit_gateway->transit_gateway_attachment': 'Transit Gateway has Attachment',
  'transit_gateway_attachment->vpc': 'Attachment connects VPC',
  'transit_gateway->transit_gateway_route_table': 'Transit Gateway contains Route Table',
  'transit_gateway_route_table->transit_gateway_attachment': 'Transit Route sends traffic to Attachment',
  'vpc->alb': 'Application Load Balancer belongs to VPC',
  'vpc->nlb': 'Network Load Balancer belongs to VPC',
  'subnet->alb': 'Subnet serves Application Load Balancer',
  'subnet->nlb': 'Subnet serves Network Load Balancer',
  'alb->sg': 'Security Group attached to Application Load Balancer',
  'nlb->sg': 'Security Group attached to Network Load Balancer',
  'vpc->target_group': 'Load Balancer Target Group belongs to VPC',
  'alb->listener': 'Application Load Balancer has Listener',
  'nlb->listener': 'Network Load Balancer has Listener',
  'listener->listener_rule': 'Listener evaluates Rule',
  'listener_rule->target_group': 'Rule forwards to Target Group',
  'target_group->target_ec2': 'Target Group registers EC2 target',
  'target_group->target_ip': 'Target Group registers IP target',
  'target_group->target_lambda': 'Target Group registers Lambda target',
  'target_group->target_alb': 'Target Group registers Application Load Balancer target'
};

const LEGACY_EDGE_LABELS = new Set(['contains', 'belongs-to', 'hosts', 'secured-by']);

function getNodeTypeFromId(id) {
  if (typeof id !== 'string') return '';
  const localId = id.split('::').at(-1);
  const dash = localId.indexOf('-');
  return dash > 0 ? localId.slice(0, dash) : '';
}

function getResourceId(id) {
  if (typeof id !== 'string') return '';
  const localId = id.split('::').at(-1);
  const dash = localId.indexOf('-');
  return dash > 0 ? localId.slice(dash + 1) : localId;
}

function shortenCanvasText(value, maxLength = 20) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  if (/^[a-z][a-z0-9_-]*-[a-f0-9]{8,}$/i.test(text)) {
    return `${text.slice(0, maxLength - 6)}…${text.slice(-5)}`;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function toDisplayNode(node) {
  const nodeData = node && typeof node.data === 'object' ? node.data : {};
  const type = nodeData.type || getNodeTypeFromId(nodeData.id);
  const service = SERVICE_MAP[type] || { heading: 'AWS Resource', icon: 'none', fallbackColor: '#4f83cc' };
  const resourceName = (nodeData.label && String(nodeData.label)) || getResourceId(nodeData.id) || 'Unknown';
  const rawId = getResourceId(nodeData.id);
  const lines = resourceName === rawId
    ? [service.heading, shortenCanvasText(rawId, 18)]
    : [shortenCanvasText(resourceName), shortenCanvasText(rawId, 18)];
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 10);
  const hasIcon = Boolean(service.icon && service.icon !== 'none');
  const icon = hasIcon && (service.icon.startsWith('/') || service.icon.startsWith('data:'))
    ? service.icon
    : hasIcon ? `/assets/${service.icon}` : 'none';
  const compact = !hasIcon;
  const nodeWidth = compact ? Math.min(236, Math.max(178, Math.round(longestLine * 7.2 + 36))) : Math.min(246, Math.max(190, Math.round(longestLine * 7.2 + 36)));
  const nodeHeight = compact ? 90 : 144;
  return {
    ...node,
    data: {
      ...nodeData,
      type,
      icon,
      fallbackColor: service.fallbackColor,
      compact: compact ? 'yes' : 'no',
      displayLabel: lines.join('\n'),
      nodeWidth,
      nodeHeight,
      textMaxWidth: Math.max(124, nodeWidth - 24)
    }
  };
}

function toDisplayEdge(edge) {
  const edgeData = edge && typeof edge.data === 'object' ? edge.data : {};
  const relationKey = `${getNodeTypeFromId(edgeData.source)}->${getNodeTypeFromId(edgeData.target)}`;
  const relationLabel = EDGE_TEXT_BY_RELATION[relationKey];
  const fullLabel = LEGACY_EDGE_LABELS.has(edgeData.label)
    ? relationLabel || edgeData.label
    : edgeData.label || relationLabel || 'AWS relationship';
  return { ...edge, data: { ...edgeData, fullLabel, displayLabel: getLiveEdgeDisplayLabel(fullLabel), visibleLabel: '' } };
}

function formatDetailValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const finishLanding = useCallback(() => setShowLanding(false), []);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('awsome.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [mode, setMode] = useState('live');
  const [profile, setProfile] = useState('default');
  const [region, setRegion] = useState('ap-southeast-2');
  const [additionalRegions, setAdditionalRegions] = useState([]);
  const [customRegion, setCustomRegion] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState(['default']);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [sourceHint, setSourceHint] = useState('');
  const [scanProgress, setScanProgress] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [currentSnapshotId, setCurrentSnapshotId] = useState('');
  const [comparison, setComparison] = useState(null);
  const [status, setStatus] = useState('Ready. Enter profile/region and click Load Topology.');
  const [error, setError] = useState(() => window.awsomeMigrationWarning || '');
  const [loading, setLoading] = useState(false);
  const [topologyStats, setTopologyStats] = useState(null);
  const [topologyGraph, setTopologyGraph] = useState(null);
  const [topologyContext, setTopologyContext] = useState(null);
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [topologyWarnings, setTopologyWarnings] = useState([]);
  const [resourceCounts, setResourceCounts] = useState({});
  const [liveSearch, setLiveSearch] = useState('');
  const [selectedLiveTypes, setSelectedLiveTypes] = useState([]);
  const [selectedLiveRegions, setSelectedLiveRegions] = useState([]);
  const [retentionCount, setRetentionCount] = useState(20);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [inspectorWidth, setInspectorWidth] = useState(258);
  const [pendingPlanImport, setPendingPlanImport] = useState(null);
  const [canFetchTopology, setCanFetchTopology] = useState(false);
  const planning = usePlanningDocument(PLANNING_SERVICES);
  const cyContainerRef = useRef(null);
  const workspaceRef = useRef(null);
  const inspectorResizeRef = useRef(null);
  const cyInstanceRef = useRef(null);
  const renderedGraphRef = useRef(null);
  const filteredGraphRef = useRef(null);
  const liveDragAutoPanRef = useRef(null);
  const liveGraphFitFrameRef = useRef(null);
  const scanRequestRef = useRef(null);
  const regionPickerRef = useRef(null);
  const scanRegions = useMemo(() => normaliseScanRegions(region, additionalRegions), [region, additionalRegions]);

  useEffect(() => {
    try {
      window.localStorage.setItem('awsome.theme', theme);
    } catch {
      // Theme persistence is best effort when browser storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => cyInstanceRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorWidth]);

  useEffect(() => {
    if (mode !== 'live' || !workspaceRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.width || window.matchMedia('(max-width: 680px)').matches) return;
      const available = Math.max(220, Math.min(720, entry.contentRect.width - 292));
      setInspectorWidth((current) => Math.min(current, available));
      cyInstanceRef.current?.resize();
    });
    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, [mode, showLanding]);

  const stopLiveDragAutoPan = useCallback(() => {
    const state = liveDragAutoPanRef.current;
    if (state?.frameId != null) window.cancelAnimationFrame(state.frameId);
    liveDragAutoPanRef.current = null;
  }, []);

  const cancelLiveGraphFit = useCallback(() => {
    if (liveGraphFitFrameRef.current != null) {
      window.cancelAnimationFrame(liveGraphFitFrameRef.current);
      liveGraphFitFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const invoke = window.awsomeDesktop?.invoke;
    if (invoke) invoke('migration_status').then(() => setCanFetchTopology(true)).catch(() => setCanFetchTopology(false));
    return () => {
      stopLiveDragAutoPan();
      cancelLiveGraphFit();
      if (cyInstanceRef.current) cyInstanceRef.current.destroy();
    };
  }, [cancelLiveGraphFit, stopLiveDragAutoPan]);

  useEffect(() => {
    const invoke = window.awsomeDesktop?.invoke;
    if (!invoke) return;
    invoke('list_profiles').then((names) => {
      if (Array.isArray(names) && names.length) setAvailableProfiles(names);
    }).catch(() => {});
    invoke('list_snapshots').then((items) => {
      if (Array.isArray(items)) {
        setSnapshots(items);
        setSelectedSnapshotId(items[0]?.id || '');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const invoke = window.awsomeDesktop?.invoke;
    if (!invoke) return;
    let cancelled = false;
    setSourceHint('Checking enabled regions…');
    const timer = window.setTimeout(() => {
      invoke('list_regions', { profile }).then((names) => {
        if (cancelled) return;
        setAvailableRegions(Array.isArray(names) ? names : []);
        setSourceHint(names?.length ? `${names.length} enabled regions available` : 'Enter an AWS region');
      }).catch(() => {
        if (!cancelled) {
          setAvailableRegions([]);
          setSourceHint('Region lookup unavailable. You can still enter a region manually.');
        }
      });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [profile]);

  const destroyGraph = useCallback(() => {
    stopLiveDragAutoPan();
    cancelLiveGraphFit();
    setHoveredEdge(null);
    renderedGraphRef.current = null;
    if (cyInstanceRef.current) {
      cyInstanceRef.current.destroy();
      cyInstanceRef.current = null;
    }
  }, [cancelLiveGraphFit, stopLiveDragAutoPan]);

  const applyZoomedFit = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.resize();
    const visible = cy.elements(':visible');
    if (!visible.length) return;
    const bounds = visible.boundingBox({
      includeEdges: true,
      includeLabels: true,
      includeOverlays: false
    });
    cy.fit(bounds, 24);
  }, []);

  const adjustLiveZoom = useCallback((factor) => {
    const cy = cyInstanceRef.current;
    if (!cy) return false;
    const bounds = cyContainerRef.current?.getBoundingClientRect();
    const level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    cy.zoom({ level, renderedPosition: { x: (bounds?.width || 0) / 2, y: (bounds?.height || 0) / 2 } });
    return true;
  }, []);

  const renderGraph = useCallback(async (graph, isCurrent, attempt = 0) => {
    if (!isCurrent()) return;
    if (!cyContainerRef.current) throw new Error('Graph container not available');
    const { clientWidth: width, clientHeight: height } = cyContainerRef.current;
    if (width === 0 || height === 0) {
      if (attempt >= 20) throw new Error('Graph canvas did not become visible');
      await new Promise((resolve) => setTimeout(resolve, 100));
      return renderGraph(graph, isCurrent, attempt + 1);
    }
    const cytoscape = (await import('cytoscape')).default;
    if (!isCurrent()) return;
    const darkGraph = theme === 'dark';
    const graphColors = darkGraph
      ? {
          nodeBackground: '#16283d',
          nodeText: '#edf5ff',
          nodeBorder: '#466580',
          nodeShadow: '#07111e',
          edge: '#88a9c4',
          edgeText: '#c5d7e8',
          edgeTextBackground: '#102033',
          edgeTextBorder: '#27435d'
        }
      : {
          nodeBackground: '#ffffff',
          nodeText: '#162033',
          nodeBorder: '#b9c7d8',
          nodeShadow: '#6d7d91',
          edge: '#8ca3bd',
          edgeText: '#53657a',
          edgeTextBackground: '#ffffff',
          edgeTextBorder: '#e2e8f0'
        };
    destroyGraph();
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes.map(toDisplayNode) : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges.map(toDisplayEdge) : [];
    const cy = cytoscape({
      container: cyContainerRef.current,
      elements: { nodes, edges },
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 'data(nodeWidth)', height: 'data(nodeHeight)', 'background-color': graphColors.nodeBackground, 'background-image': 'data(icon)', 'background-fit': 'none', 'background-width': 48, 'background-height': 48, 'background-position-x': '50%', 'background-position-y': '25%', 'background-repeat': 'no-repeat', 'background-image-opacity': 1, 'background-opacity': 1, label: 'data(displayLabel)', color: graphColors.nodeText, 'font-family': '"Inter Variable", Inter, sans-serif', 'font-size': 15, 'font-weight': 650, 'line-height': 1.35, 'text-wrap': 'wrap', 'text-max-width': 'data(textMaxWidth)', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': -50, 'text-justification': 'center', 'border-width': 1.2, 'border-color': graphColors.nodeBorder, 'overlay-opacity': 0, padding: 0, 'shadow-color': graphColors.nodeShadow, 'shadow-blur': 5, 'shadow-opacity': darkGraph ? 0.32 : 0.12, 'shadow-offset-x': 0, 'shadow-offset-y': 3, 'transition-property': 'border-color, border-width, shadow-blur, shadow-opacity', 'transition-duration': '180ms' } },
        { selector: 'node.hovered', style: { 'border-color': '#6fa8e8', 'border-width': 2.4, 'shadow-color': '#60a5fa', 'shadow-blur': 15, 'shadow-opacity': 0.35 } },
        { selector: 'node[compact = "yes"]', style: { 'text-valign': 'center', 'text-margin-y': 0, 'background-color': darkGraph ? '#1c3047' : '#f8fafc', 'border-color': darkGraph ? '#55748e' : '#cbd5e1' } },
        { selector: 'node.connected-node', style: { 'border-color': '#4f83cc', 'shadow-opacity': 0.27 } },
        { selector: 'node:selected', style: { 'border-color': '#2563eb', 'border-width': 2.6, 'shadow-color': '#60a5fa', 'shadow-blur': 16, 'shadow-opacity': 0.42 } },
        { selector: 'edge', style: { width: 2, 'line-color': graphColors.edge, 'target-arrow-color': graphColors.edge, 'target-arrow-shape': 'triangle', 'arrow-scale': 1.2, 'curve-style': 'bezier', 'control-point-step-size': 36, label: 'data(visibleLabel)', color: graphColors.edgeText, 'font-family': '"Inter Variable", Inter, sans-serif', 'font-size': 13, 'font-weight': 640, 'text-rotation': 'none', 'text-margin-y': -10, 'text-background-color': graphColors.edgeTextBackground, 'text-background-opacity': 0.92, 'text-background-padding': 3, 'text-border-color': graphColors.edgeTextBorder, 'text-border-width': 0.5, 'text-border-opacity': 0.9, 'overlay-opacity': 0, 'transition-property': 'line-color, target-arrow-color, width', 'transition-duration': '180ms' } },
        { selector: 'edge.connected-hover, edge:selected', style: { width: 2.8, 'line-color': '#6fa8e8', 'target-arrow-color': '#6fa8e8' } }
      ],
      layout: { name: 'breadthfirst', directed: true, animate: false, fit: false, padding: 86, spacingFactor: 1.6, avoidOverlap: true, nodeDimensionsIncludeLabels: true },
      minZoom: 0.3,
      maxZoom: 6,
      userZoomingEnabled: true,
      panningEnabled: true,
      userPanningEnabled: true
    });
    cyInstanceRef.current = cy;
    const visibleIds = new Set((filteredGraphRef.current?.nodes || []).map((node) => node.data.id));
    const visibleEdgeIds = new Set((filteredGraphRef.current?.edges || []).map((edge) => edge.data.id));
    cy.batch(() => {
      cy.nodes().forEach((node) => { if (!visibleIds.has(node.id())) node.hide(); });
      cy.edges().forEach((edge) => { if (!visibleEdgeIds.has(edge.id())) edge.hide(); });
    });
    const labelContext = document.createElement('canvas').getContext('2d');
    if (labelContext) labelContext.font = '640 13px "Inter Variable", Inter, sans-serif';
    const updateVisibleEdgeLabels = (candidateEdges = cy.edges()) => {
      cy.batch(() => candidateEdges.forEach((edge) => {
        const source = edge.sourceEndpoint();
        const target = edge.targetEndpoint();
        const distance = Math.hypot(target.x - source.x, target.y - source.y);
        const caption = edge.data('displayLabel');
        const width = labelContext?.measureText(caption).width ?? caption.length * 7;
        const visibleLabel = canShowLiveEdgeLabel(distance, width) ? caption : '';
        if (edge.data('visibleLabel') !== visibleLabel) edge.data('visibleLabel', visibleLabel);
      }));
    };
    updateVisibleEdgeLabels();
    cy.on('position', 'node', (event) => updateVisibleEdgeLabels(event.target.connectedEdges()));
    applyZoomedFit();
    liveGraphFitFrameRef.current = window.requestAnimationFrame(() => {
      liveGraphFitFrameRef.current = null;
      if (cyInstanceRef.current === cy && !cy.destroyed()) applyZoomedFit();
    });
    const liveCanvasElement = cyContainerRef.current;
    const stopLiveCanvasPanning = () => liveCanvasElement?.classList.remove(styles.cyPanning);

    cy.on('mousedown', (event) => {
      if (event.target === cy) liveCanvasElement?.classList.add(styles.cyPanning);
    });
    cy.on('mouseup tapend', stopLiveCanvasPanning);
    window.addEventListener('pointerup', stopLiveCanvasPanning, true);
    cy.one('destroy', () => {
      stopLiveCanvasPanning();
      window.removeEventListener('pointerup', stopLiveCanvasPanning, true);
    });

    const beginLiveDragAutoPan = (event) => {
      stopLiveDragAutoPan();
      const state = {
        cy,
        pointer: event.renderedPosition || event.target.renderedPosition(),
        frameId: null,
        lastFrameTime: null
      };
      liveDragAutoPanRef.current = state;

      const tick = (frameTime) => {
        if (liveDragAutoPanRef.current !== state || cy.destroyed()) return;
        const container = cyContainerRef.current;
        if (!container) {
          stopLiveDragAutoPan();
          return;
        }

        const velocity = getLiveCanvasAutoPanDelta(state.pointer, {
          width: container.clientWidth,
          height: container.clientHeight
        });
        const elapsedSeconds = state.lastFrameTime == null
          ? 1 / 60
          : Math.min(0.05, Math.max(0, (frameTime - state.lastFrameTime) / 1000));
        state.lastFrameTime = frameTime;
        const delta = {
          x: velocity.x * elapsedSeconds,
          y: velocity.y * elapsedSeconds
        };
        if (delta.x !== 0 || delta.y !== 0) {
          const zoom = cy.zoom();
          const grabbedNodes = cy.nodes(':grabbed');
          cy.panBy(delta);
          grabbedNodes.forEach((node) => {
            const position = node.position();
            node.position({
              x: position.x - delta.x / zoom,
              y: position.y - delta.y / zoom
            });
          });
        }
        state.frameId = window.requestAnimationFrame(tick);
      };

      state.frameId = window.requestAnimationFrame(tick);
    };

    cy.on('grab', 'node', beginLiveDragAutoPan);
    cy.on('drag', 'node', (event) => {
      const state = liveDragAutoPanRef.current;
      if (state?.cy === cy && event.renderedPosition) state.pointer = event.renderedPosition;
    });
    cy.on('free', 'node', stopLiveDragAutoPan);
    cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      cy.elements('.connected-hover').removeClass('connected-hover');
      cy.elements('.connected-node').removeClass('connected-node');
      node.addClass('hovered');
      node.connectedEdges().addClass('connected-hover');
      node.connectedEdges().connectedNodes().addClass('connected-node');
    });
    cy.on('mouseout', 'node', (event) => {
      event.target.removeClass('hovered');
      cy.elements('.connected-hover').removeClass('connected-hover');
      cy.elements('.connected-node').removeClass('connected-node');
    });
    cy.on('mouseover', 'edge', (event) => {
      event.target.addClass('connected-hover');
      setHoveredEdge({ id: event.target.id(), label: event.target.data('fullLabel') });
    });
    cy.on('mouseout', 'edge', (event) => {
      event.target.removeClass('connected-hover');
      setHoveredEdge((current) => current?.id === event.target.id() ? null : current);
    });
    cy.on('tap', 'node', (event) => {
      const nodeData = event.target.data();
      setComparison(null);
      setSelectedEdge(null);
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type || getNodeTypeFromId(nodeData.id),
        region: nodeData.region,
        details: nodeData.details && typeof nodeData.details === 'object' ? nodeData.details : {}
      });
    });
    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      setComparison(null);
      setSelectedNode(null);
      setSelectedEdge({
        id: edge.id(),
        label: edge.data('fullLabel'),
        source: edge.source().data('label') || getResourceId(edge.source().id()),
        target: edge.target().data('label') || getResourceId(edge.target().id())
      });
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });
    renderedGraphRef.current = { graph, theme, container: cyContainerRef.current };
  }, [applyZoomedFit, destroyGraph, stopLiveDragAutoPan, theme]);

  const filteredTopologyGraph = useMemo(
    () => filterLiveTopologyGraph(topologyGraph, { query: liveSearch, selectedTypes: selectedLiveTypes, selectedRegions: selectedLiveRegions }),
    [liveSearch, selectedLiveTypes, selectedLiveRegions, topologyGraph]
  );
  filteredGraphRef.current = filteredTopologyGraph;
  const hasLiveFilters = Boolean(liveSearch.trim() || selectedLiveTypes.length || selectedLiveRegions.length);

  useEffect(() => {
    if (mode !== 'live' || !topologyGraph) return undefined;
    const rendered = renderedGraphRef.current;
    if (rendered?.graph === topologyGraph && rendered.theme === theme && rendered.container === cyContainerRef.current && !cyInstanceRef.current?.destroyed()) {
      const frame = window.requestAnimationFrame(() => cyInstanceRef.current?.resize());
      return () => window.cancelAnimationFrame(frame);
    }
    let cancelled = false;
    const renderTimer = window.setTimeout(() => {
      renderGraph(topologyGraph, () => !cancelled).catch((error) => {
        if (!cancelled) setError(`Could not draw topology: ${error?.message || error}`);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(renderTimer); };
  }, [mode, renderGraph, theme, topologyGraph]);

  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy || cy.destroyed()) return;
    const nodeIds = new Set(filteredTopologyGraph.nodes.map((node) => node.data.id));
    const edgeIds = new Set(filteredTopologyGraph.edges.map((edge) => edge.data.id));
    cy.batch(() => {
      cy.nodes().forEach((node) => nodeIds.has(node.id()) ? node.show() : node.hide());
      cy.edges().forEach((edge) => edgeIds.has(edge.id()) ? edge.show() : edge.hide());
    });
  }, [filteredTopologyGraph]);

  const focusFirstResult = useCallback(() => {
    const cy = cyInstanceRef.current;
    const firstId = filteredGraphRef.current?.nodes?.[0]?.data?.id;
    const node = firstId && cy?.getElementById(firstId);
    if (!node?.length) return;
    cy.animate({ center: { eles: node } }, { duration: 220 });
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (mode !== 'live') return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const direction = getKeyboardZoomDirection(event);
      if (direction > 0 && adjustLiveZoom(1.18)) event.preventDefault();
      if (direction < 0 && adjustLiveZoom(1 / 1.18)) event.preventDefault();
      if (event.key === '0' && cyInstanceRef.current) {
        event.preventDefault();
        applyZoomedFit();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [adjustLiveZoom, applyZoomedFit, mode]);

  const showTopology = useCallback((graph, context, snapshotId = '') => {
    setTopologyGraph(graph);
    const warnings = Array.isArray(graph?.warnings)
      ? graph.warnings.filter((warning) => typeof warning === 'string' && warning.trim())
      : [];
    setTopologyWarnings(warnings);
    setTopologyContext(context);
    setSnapshotStale(false);
    setCurrentSnapshotId(snapshotId);
    setSelectedNode(null);
    setSelectedEdge(null);
    setLiveSearch('');
    setSelectedLiveTypes([]);
    setSelectedLiveRegions([]);
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
    const edges = Array.isArray(graph?.edges) ? graph.edges.length : 0;
    const counts = (Array.isArray(graph?.nodes) ? graph.nodes : []).reduce((result, node) => {
      const type = node?.data?.type || getNodeTypeFromId(node?.data?.id);
      if (type) result[type] = (result[type] || 0) + 1;
      return result;
    }, {});
    setTopologyStats({ nodes, edges });
    setResourceCounts(counts);
    return { nodes, edges, warnings };
  }, []);

  const refreshSnapshotList = useCallback(async (preferredId = '') => {
    const items = await window.awsomeDesktop.invoke('list_snapshots');
    if (Array.isArray(items)) {
      setSnapshots(items);
      setSelectedSnapshotId(preferredId || items[0]?.id || '');
    }
    return items;
  }, []);

  const fetchTopology = useCallback(async (isRefresh) => {
    const invoke = window.awsomeDesktop?.invoke;
    if (!invoke) {
      setError('The Electron companion is unavailable. Start awsome with `npm run start`.');
      return;
    }
    if (!scanRegions.length) {
      setError('Choose at least one AWS region before scanning.');
      return;
    }
    if (regionPickerRef.current) regionPickerRef.current.open = false;
    setError('');
    setLoading(true);
    if (topologyGraph) setSnapshotStale(true);
    setSelectedNode(null);
    setSelectedEdge(null);
    setComparison(null);
    setStatus(isRefresh ? 'Refreshing topology from AWS...' : 'Loading topology from AWS...');
    const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    scanRequestRef.current = requestId;
    let progressTimer;
    try {
      progressTimer = window.setInterval(() => {
        invoke('get_scan_progress').then((progress) => {
          if (scanRequestRef.current === requestId && progress?.requestId === requestId) setScanProgress(progress);
        }).catch(() => {});
      }, 300);
      const graph = await invoke('fetch_topology', { profile, regions: scanRegions, requestId });
      const context = { profile: profile.trim() || 'default', region: scanRegions.join(', '), regions: scanRegions, loadedAt: new Date().toISOString() };
      const { nodes, edges, warnings } = showTopology(graph, context);
      try {
        let earlierScans = snapshots;
        try { earlierScans = await invoke('list_snapshots'); } catch { /* Use the list already shown in the picker. */ }
        const previous = earlierScans.find((item) => sameScanSource(item.profile, normaliseScanRegions('', item.region.split(',')), context.profile, scanRegions));
        const saved = await invoke('save_snapshot', { profile: context.profile, region: context.region, graph });
        setCurrentSnapshotId(saved.id);
        await refreshSnapshotList(saved.id);
        if (previous) {
          const baseline = await invoke('load_snapshot', { id: previous.id });
          setComparison({ baseline: previous, diff: compareTopologySnapshots(baseline.graph, graph) });
        }
      } catch (saveError) {
        setStatus(`Topology loaded, but could not save snapshot: ${saveError?.message || saveError}`);
        return;
      }
      setStatus(warnings.length
        ? `Topology loaded with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}: ${nodes} resources, ${edges} connection${edges === 1 ? '' : 's'}.`
        : `Topology loaded successfully: ${nodes} resources, ${edges} connection${edges === 1 ? '' : 's'}.`);
    } catch (err) {
      const message = err?.message || String(err);
      if (message === 'Scan cancelled') {
        setSnapshotStale(false);
        setStatus(topologyGraph ? 'Scan cancelled. Previous topology remains visible.' : 'Scan cancelled.');
      } else {
        setError(`Failed to load topology: ${message}`);
        setStatus(topologyGraph
          ? 'Failed to load topology. The previous snapshot remains visible.'
          : 'Failed to load topology. Review error details above.');
      }
    } finally {
      window.clearInterval(progressTimer);
      scanRequestRef.current = null;
      setScanProgress(null);
      setLoading(false);
    }
  }, [profile, refreshSnapshotList, scanRegions, showTopology, snapshots, topologyGraph]);

  const cancelTopologyScan = useCallback(async () => {
    const requestId = scanRequestRef.current;
    if (!requestId) return;
    setStatus('Cancelling scan…');
    try { await window.awsomeDesktop.invoke('cancel_scan', { requestId }); } catch { /* The scan may have finished. */ }
  }, []);

  const openSavedSnapshot = useCallback(async () => {
    if (!selectedSnapshotId) return;
    try {
      const saved = await window.awsomeDesktop.invoke('load_snapshot', { id: selectedSnapshotId });
      const regions = graphRegions(saved.graph, saved.region);
      const context = { profile: saved.profile, region: regions.join(', '), regions, loadedAt: new Date(Number(saved.capturedAt)).toISOString() };
      const { nodes, edges } = showTopology(saved.graph, context, saved.id);
      setProfile(saved.profile);
      setRegion(regions[0] || 'ap-southeast-2');
      setAdditionalRegions(regions.slice(1));
      setComparison(null);
      setError('');
      setStatus(`Opened saved snapshot: ${nodes} resources, ${edges} connection${edges === 1 ? '' : 's'}.`);
    } catch (err) { setError(`Could not open snapshot: ${err?.message || err}`); }
  }, [selectedSnapshotId, showTopology]);

  const compareSavedSnapshot = useCallback(async () => {
    if (!selectedSnapshotId || !topologyGraph) return;
    try {
      const baseline = await window.awsomeDesktop.invoke('load_snapshot', { id: selectedSnapshotId });
      if (!sameScanSource(baseline.profile, graphRegions(baseline.graph, baseline.region), topologyContext?.profile, graphRegions(topologyGraph, topologyContext?.region))) {
        throw new Error('Choose a saved scan from the same profile and regions to compare.');
      }
      setComparison({ baseline, diff: compareTopologySnapshots(baseline.graph, topologyGraph) });
      setError('');
    } catch (err) { setError(`Could not compare snapshots: ${err?.message || err}`); }
  }, [selectedSnapshotId, topologyContext, topologyGraph]);

  const deleteSavedSnapshot = useCallback(async () => {
    if (!selectedSnapshotId) return;
    const selected = snapshots.find((item) => item.id === selectedSnapshotId);
    if (!selected) {
      setError('The selected saved scan is no longer available.');
      return;
    }
    const message = `Delete this saved scan from this device?\n\n${selected.profile} / ${selected.region}\n${new Date(Number(selected.capturedAt)).toLocaleString()}\nScan ID: ${selected.id}\n\nThis cannot be undone.`;
    if (!window.confirm(message)) return;
    try {
      await window.awsomeDesktop.invoke('delete_snapshot', { id: selectedSnapshotId });
      if (currentSnapshotId === selectedSnapshotId) setCurrentSnapshotId('');
      setComparison(null);
      await refreshSnapshotList();
      setStatus('Saved snapshot deleted.');
    } catch (err) { setError(`Could not delete snapshot: ${err?.message || err}`); }
  }, [currentSnapshotId, refreshSnapshotList, selectedSnapshotId, snapshots]);

  const pruneSavedSnapshots = useCallback(async () => {
    if (cleanupPending) return;
    setCleanupPending(true);
    setError('');
    try {
      const invoke = window.awsomeDesktop.invoke;
      const expected = await invoke('preview_prune_snapshots', { keepPerSource: retentionCount });
      if (!expected.length) {
        setStatus('No older saved scans need cleanup.');
        return;
      }
      const candidates = expected.map((item) => `${item.profile} / ${item.region} · ${new Date(Number(item.capturedAt)).toLocaleString()} · ${item.id}`).join('\n');
      const message = `Keep the newest ${retentionCount} scans per profile and region set?\n\nDelete these ${expected.length} saved scans from this device:\n${candidates}\n\nThis cannot be undone.`;
      if (!window.confirm(message)) return;
      const removed = await invoke('prune_snapshots', { keepPerSource: retentionCount, expected });
      const remaining = await refreshSnapshotList();
      if (currentSnapshotId && !remaining.some((item) => item.id === currentSnapshotId)) setCurrentSnapshotId('');
      setComparison(null);
      setError('');
      setStatus(`Removed ${removed} older saved scan${removed === 1 ? '' : 's'}.`);
    } catch (err) { setError(`Could not clean up scans: ${err?.message || err}`); }
    finally { setCleanupPending(false); }
  }, [cleanupPending, currentSnapshotId, refreshSnapshotList, retentionCount]);

  const switchMode = useCallback((nextMode) => {
    if (nextMode === mode) return;
    startTransition(() => setMode(nextMode));
  }, [mode]);

  const openTopologyInPlanning = useCallback(() => {
    if (!topologyGraph || !topologyContext) return;
    const importedPlan = convertLiveTopologyToPlan(topologyGraph, topologyContext);
    if (planning.nodes.length || planning.edges.length) {
      setPendingPlanImport(importedPlan);
      return;
    }
    planning.setNodes(importedPlan.nodes);
    planning.setEdges(importedPlan.edges);
    planning.setCanvasZoom(DEFAULT_PLANNING_ZOOM);
    planning.setCanvasPan({ x: 0, y: 0 });
    switchMode('planning');
  }, [planning, switchMode, topologyContext, topologyGraph]);

  const finishPlanImport = useCallback((choice) => {
    if (!pendingPlanImport) return;
    if (choice === 'replace') {
      planning.setNodes(pendingPlanImport.nodes);
      planning.setEdges(pendingPlanImport.edges);
      planning.setCanvasZoom(DEFAULT_PLANNING_ZOOM);
      planning.setCanvasPan({ x: 0, y: 0 });
    }
    if (choice === 'append') {
      const merged = mergePlanningGraphs(
        { nodes: planning.nodes, edges: planning.edges },
        pendingPlanImport
      );
      planning.setNodes(merged.nodes);
      planning.setEdges(merged.edges);
    }
    setPendingPlanImport(null);
    if (choice !== 'cancel') switchMode('planning');
  }, [pendingPlanImport, planning, switchMode]);

  const selectedService = selectedNode ? SERVICE_MAP[selectedNode.type] || { heading: 'AWS Resource', fallbackColor: '#6b8fca' } : null;
  const activeLegendItems = Object.keys(SERVICE_MAP).filter((type) => resourceCounts[type] > 0);
  const visibleTopologyStats = topologyStats
    ? { nodes: filteredTopologyGraph.nodes.length, edges: filteredTopologyGraph.edges.length }
    : null;
  const selectedNodeHidden = selectedNode && !filteredTopologyGraph.nodes.some((node) => node.data.id === selectedNode.id);
  const selectedEdgeHidden = selectedEdge && !filteredTopologyGraph.edges.some((edge) => edge.data.id === selectedEdge.id);
  const topologyRegions = graphRegions(topologyGraph, topologyContext?.region);
  const toggleAdditionalRegion = (name) => {
    setAdditionalRegions((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };
  const addCustomRegion = () => {
    const name = customRegion.trim().toLowerCase();
    if (name && name !== region.trim().toLowerCase() && !additionalRegions.includes(name)) setAdditionalRegions((current) => [...current, name]);
    setCustomRegion('');
  };
  const toggleLiveResourceType = (type) => {
    setSelectedLiveTypes((current) => current.includes(type)
      ? current.filter((selected) => selected !== type)
      : [...current, type]);
  };
  const clearLiveFilters = () => {
    setLiveSearch('');
    setSelectedLiveTypes([]);
    setSelectedLiveRegions([]);
  };
  const maxInspectorWidth = () => Math.max(220, Math.min(720, (workspaceRef.current?.clientWidth || 1012) - 292));
  const beginInspectorResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorResizeRef.current = { pointerId: event.pointerId, handle: event.currentTarget, startX: event.clientX, startWidth: inspectorWidth, maxWidth: maxInspectorWidth(), width: inspectorWidth, frame: null };
  };
  const moveInspectorResize = (event) => {
    const resize = inspectorResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resize.width = Math.max(220, Math.min(resize.maxWidth, resize.startWidth + resize.startX - event.clientX));
    if (resize.frame == null) {
      resize.frame = window.requestAnimationFrame(() => {
        workspaceRef.current?.style.setProperty('--inspector-width', `${resize.width}px`);
        resize.handle.setAttribute('aria-valuenow', String(Math.round(resize.width)));
        resize.frame = null;
      });
    }
  };
  const endInspectorResize = (event) => {
    const resize = inspectorResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resize.frame != null) window.cancelAnimationFrame(resize.frame);
    workspaceRef.current?.style.setProperty('--inspector-width', `${resize.width}px`);
    resize.handle.setAttribute('aria-valuenow', String(Math.round(resize.width)));
    inspectorResizeRef.current = null;
    setInspectorWidth(resize.width);
  };
  const resizeInspectorByKeyboard = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setInspectorWidth((current) => Math.max(220, Math.min(maxInspectorWidth(), current + (event.key === 'ArrowLeft' ? 20 : -20))));
  };

  if (showLanding) return <Landing onComplete={finishLanding} />;

  return <main className={styles.appShell} data-theme={theme}>
    <section className={styles.mainView}>
      <header className={styles.topbar}>
        <div className={styles.brandLockup}><span className={styles.brandMark}><img src={logo} alt="" aria-hidden="true" draggable="false" /></span><div><span className={styles.brandName}>awsome</span><span className={styles.brandCaption}>AWS topology explorer</span></div></div>
        <nav className={styles.modeSwitch} aria-label="Workspace mode"><button type="button" className={mode === 'live' ? styles.modeActive : ''} onClick={() => switchMode('live')}><i />Live mode</button><button type="button" className={mode === 'planning' ? styles.modeActive : ''} onClick={() => switchMode('planning')}><Icon name="grid" size={14} />Planning mode</button></nav>
        <div className={styles.topbarMeta}><button type="button" className={styles.themeToggle} aria-pressed={theme === 'dark'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /><span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button><span className={`${styles.connectionState} ${canFetchTopology ? styles.connectionReady : styles.connectionOffline}`}><i /> {canFetchTopology ? 'Native backend ready' : 'Electron companion unavailable'}</span></div>
      </header>
      {mode === 'planning' ? <div className={styles.modeStage}><PlanningWorkspace planning={planning} /></div> : null}
      <div className={styles.modeStage} hidden={mode !== 'live'}>
      <div className={styles.toolbarCard}>
        <div className={styles.sourceLabel}><Icon name="database" size={15} /><span>Data source</span></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-profile">AWS profile</label><input id="aws-profile" list="aws-profile-options" value={profile} onChange={(event) => { setProfile(event.target.value); setAdditionalRegions([]); }} disabled={loading} autoComplete="off" /><datalist id="aws-profile-options">{availableProfiles.map((name) => <option key={name} value={name} />)}</datalist></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-region">Primary region</label><input id="aws-region" list="aws-region-options" value={region} onChange={(event) => { const next = event.target.value; setRegion(next); setAdditionalRegions((current) => current.filter((name) => name !== next.trim().toLowerCase())); }} disabled={loading} autoComplete="off" /><datalist id="aws-region-options">{availableRegions.map((name) => <option key={name} value={name} />)}</datalist></div>
        <div className={styles.regionPicker}><details ref={regionPickerRef}><summary>More regions{additionalRegions.length ? ` (${additionalRegions.length})` : ''}</summary><div className={styles.regionOptions}><strong>Scan additional regions</strong><p>Select enabled regions or enter another region code.</p><div className={styles.regionOptionList}>{availableRegions.filter((name) => name !== region.trim()).map((name) => <label key={name}><input type="checkbox" checked={additionalRegions.includes(name)} disabled={loading} onChange={() => toggleAdditionalRegion(name)} />{name}</label>)}</div><div className={styles.regionCustomInput}><input value={customRegion} onChange={(event) => setCustomRegion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomRegion(); } }} disabled={loading} placeholder="Region code" aria-label="Additional region code" /><button type="button" disabled={loading || !customRegion.trim()} onClick={addCustomRegion}>Add</button></div>{additionalRegions.length ? <div className={styles.regionSelections}>{additionalRegions.map((name) => <button key={name} type="button" disabled={loading} onClick={() => toggleAdditionalRegion(name)} aria-label={`Remove ${name} from scan`}>{name} ×</button>)}</div> : null}</div></details></div>
        <label className={styles.liveSearchBox}><Icon name="search" size={15} /><span>Find resource</span><input value={liveSearch} onChange={(event) => setLiveSearch(event.target.value)} disabled={loading || !topologyGraph} placeholder="Name, ID, detail…" aria-label="Search live topology resources" /></label>
        <div className={styles.actionsGroup}>
          <button className={styles.secondaryBtn} disabled={loading || !topologyGraph} onClick={openTopologyInPlanning}><Icon name="grid" size={15} /> Open in planning</button>
          <button className={styles.secondaryBtn} disabled={loading || !topologyStats} onClick={() => fetchTopology(true)}><Icon name="refresh" size={15} /> Refresh</button>
          {loading ? <button className={styles.secondaryBtn} type="button" onClick={cancelTopologyScan}><Icon name="close" size={15} /> Cancel scan</button> : null}
          <button className={styles.primaryBtn} disabled={loading} onClick={() => fetchTopology(false)}>{loading ? <><span className={styles.buttonSpinner} /> Scanning</> : <><Icon name="network" size={15} /> Load topology</>}</button>
        </div>
      </div>
      <div className={styles.snapshotBar}>
        <div className={styles.snapshotSourceHint}>{scanRegions.length} selected region{scanRegions.length === 1 ? '' : 's'}{sourceHint ? ` · ${sourceHint}` : ''}</div>
        <label htmlFor="saved-snapshot">Saved scans</label>
        <select id="saved-snapshot" value={selectedSnapshotId} onChange={(event) => setSelectedSnapshotId(event.target.value)} disabled={loading || !snapshots.length}>
          {!snapshots.length ? <option value="">No saved scans</option> : snapshots.map((item) => <option key={item.id} value={item.id}>{item.profile} / {item.region} · {new Date(Number(item.capturedAt)).toLocaleString()} · {item.nodes} resources</option>)}
        </select>
        <button className={styles.secondaryBtn} type="button" disabled={loading || !selectedSnapshotId} onClick={openSavedSnapshot}>Open offline</button>
        <button className={styles.secondaryBtn} type="button" disabled={loading || !selectedSnapshotId || !topologyGraph} onClick={compareSavedSnapshot}>Compare</button>
        <button className={styles.secondaryBtn} type="button" disabled={loading || !selectedSnapshotId} onClick={deleteSavedSnapshot} aria-label="Delete selected saved scan"><Icon name="trash" size={15} /></button>
        <details className={styles.retentionMenu}><summary>Storage</summary><div><strong>{snapshots.length} saved scans · {(snapshots.reduce((sum, item) => sum + (item.bytes || 0), 0) / 1024 / 1024).toFixed(1)} MB</strong><label>Keep newest per source<select value={retentionCount} onChange={(event) => setRetentionCount(Number(event.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button className={styles.secondaryBtn} type="button" disabled={loading || cleanupPending || !snapshots.length} onClick={pruneSavedSnapshots}>{cleanupPending ? 'Checking saved scans…' : 'Review cleanup'}</button></div></details>
      </div>
      {error ? <div className={styles.errorBanner} role="alert"><Icon name="info" size={17} /><div><strong>Could not complete action</strong><p>{error.replace('Failed to load topology: ', '')}</p></div></div> : null}
      {snapshotStale && !loading && topologyContext ? <div className={styles.warningBanner} role="status"><Icon name="info" size={17} /><div><strong>Showing a previous snapshot</strong><p>The latest load failed. This graph still shows {topologyContext.profile} in {topologyContext.region} from {new Date(topologyContext.loadedAt).toLocaleString()}.</p></div></div> : null}
      {topologyWarnings.length ? <section className={styles.warningBanner} role="status" aria-live="polite" aria-label="Incomplete AWS inventory warnings"><Icon name="info" size={17} /><div><strong>{snapshotStale ? 'Previous snapshot had incomplete inventory' : 'Topology loaded with incomplete inventory'}</strong><p>Some AWS resources could not be read. The displayed topology includes all successfully discovered resources.</p><ul>{topologyWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></section> : null}
      {topologyRegions.length > 1 ? <div className={styles.regionFilterBar} role="group" aria-label="Filter topology by region"><span>Regions</span><button type="button" className={!selectedLiveRegions.length ? styles.regionFilterActive : ''} onClick={() => setSelectedLiveRegions([])}>All</button>{topologyRegions.map((name) => <button key={name} type="button" className={selectedLiveRegions.length === 1 && selectedLiveRegions[0] === name ? styles.regionFilterActive : ''} onClick={() => setSelectedLiveRegions([name])}>{name} · {topologyGraph.nodes.filter((node) => node.data.region === name).length}</button>)}</div> : null}
      <div className={styles.workspaceMeta}><div><strong>{snapshotStale && !loading ? 'Previous snapshot' : 'Topology'}</strong><span>{topologyStats ? hasLiveFilters ? `${visibleTopologyStats.nodes} of ${topologyStats.nodes} resources · ${visibleTopologyStats.edges} of ${topologyStats.edges} connections shown` : `${topologyStats.nodes} resources · ${topologyStats.edges} connection${topologyStats.edges === 1 ? '' : 's'}` : 'No topology loaded'}{topologyContext ? ` · ${topologyContext.profile} / ${topologyContext.region} · ${currentSnapshotId ? 'saved' : 'loaded'} ${new Date(topologyContext.loadedAt).toLocaleString()}` : ''}</span></div><div className={styles.status} role="status"><span className={`${styles.statusDot} ${loading ? styles.statusDotLoading : ''}`} />{status}</div></div>
      <div ref={workspaceRef} className={styles.workspace} style={{ '--inspector-width': `${inspectorWidth}px` }}>
        <section className={styles.graphPanel} aria-label="AWS topology graph">
          <div className={styles.canvasTools}><div className={styles.legend} aria-label="Filter topology by resource type">{activeLegendItems.map((type) => <button key={type} type="button" className={selectedLiveTypes.length && !selectedLiveTypes.includes(type) ? styles.legendFilterInactive : ''} aria-pressed={!selectedLiveTypes.length || selectedLiveTypes.includes(type)} onClick={() => toggleLiveResourceType(type)} title={`Show only ${SERVICE_MAP[type].heading} resources`}><i style={{ backgroundColor: SERVICE_MAP[type].fallbackColor }} />{SERVICE_MAP[type].heading}</button>)}</div><div className={styles.canvasToolActions}><button className={styles.iconButton} type="button" onClick={focusFirstResult} disabled={!filteredTopologyGraph.nodes.length} aria-label="Focus first matching resource" title="Focus first matching resource"><Icon name="cursor" size={16} /></button><button className={styles.iconButton} type="button" onClick={applyZoomedFit} aria-label="Fit topology to view" title="Fit topology to view"><Icon name="fit" size={16} /></button></div></div>
          {!topologyStats && !loading ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="cloud" size={26} /></span><h1>Map your AWS infrastructure</h1><p>Choose a local AWS profile and region, then load the live resource relationships.</p><button className={styles.primaryBtn} type="button" onClick={() => fetchTopology(false)}><Icon name="network" size={15} /> Load topology</button></div> : null}
          {topologyStats && !loading && !filteredTopologyGraph.nodes.length ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="search" size={26} /></span><h1>{hasLiveFilters ? 'No matching resources' : 'No resources found'}</h1><p>{hasLiveFilters ? 'Adjust the search or resource-type filters to see more of this topology.' : 'The selected regions have no discovered resources in the supported inventory.'}</p>{hasLiveFilters ? <button className={styles.secondaryBtn} type="button" onClick={clearLiveFilters}>Clear filters</button> : null}</div> : null}
          {loading ? <div className={styles.loadingOverlay} role="status" aria-live="polite"><div className={styles.scanProgressHeading}><span className={styles.loadingPulse} />{scanProgress?.regions?.length ? `${scanProgress.regions.filter((item) => item.status === 'succeeded' || item.status === 'failed').length} of ${scanProgress.regions.length} regions finished` : 'Connecting to AWS…'}</div>{scanProgress?.regions?.length ? <ul className={styles.scanRegionList}>{scanProgress.regions.map((item) => <li key={item.region}><strong>{item.region}</strong><span className={item.status === 'failed' ? styles.scanRegionFailed : ''}>{item.status === 'queued' ? 'Waiting' : item.status === 'succeeded' ? 'Complete' : item.status === 'failed' ? 'Failed' : `${item.completed} of ${item.total} · ${item.stage}`}</span></li>)}</ul> : null}</div> : null}
          <div
            ref={cyContainerRef}
            className={`${styles.cy} ${topologyGraph ? styles.cyInteractive : ''}`}
            title={topologyGraph ? 'Drag empty canvas space to move around the topology' : undefined}
          />
          {hoveredEdge ? <div className={styles.edgeHint}><strong>Relationship</strong><span>{hoveredEdge.label}</span></div> : null}
        </section>
        <div className={styles.inspectorShell}>
        <div className={styles.inspectorResizeHandle} role="separator" aria-label="Resize topology details" aria-orientation="vertical" aria-valuemin="220" aria-valuemax={maxInspectorWidth()} aria-valuenow={Math.round(inspectorWidth)} tabIndex={0} onPointerDown={beginInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={endInspectorResize} onPointerCancel={endInspectorResize} onKeyDown={resizeInspectorByKeyboard} title="Drag left or right to resize details"><Icon name="resizeHorizontal" size={15} /></div>
        <aside className={styles.inspector} aria-label="Topology details">
          {comparison ? <section className={styles.comparisonPanel} aria-label="Snapshot comparison">
            <div><strong>Snapshot changes</strong><button type="button" onClick={() => setComparison(null)} aria-label="Close comparison"><Icon name="close" size={15} /></button></div>
            <p>Compared with {comparison.baseline.profile} / {comparison.baseline.region} from {new Date(Number(comparison.baseline.capturedAt)).toLocaleString()}</p>
            <p>{snapshotChangeCount(comparison.diff) === 0 ? 'No confirmed resource or relationship changes.' : `Resources: ${comparison.diff.nodes.added.length} added, ${comparison.diff.nodes.removed.length} removed, ${comparison.diff.nodes.changed.length} changed. Relationships: ${comparison.diff.edges.added.length} added, ${comparison.diff.edges.removed.length} removed, ${comparison.diff.edges.changed.length} changed.`}</p>
            {snapshotUncertainCount(comparison.diff) || comparison.baseline.warnings || comparison.baseline.graph?.warnings?.length || topologyGraph?.warnings?.length ? <p className={styles.comparisonCaution}>Incomplete inventory in one scan: {snapshotUncertainCount(comparison.diff)} resource or relationship entries were excluded from the change counts. Missing data is not reported as a deletion.</p> : null}
            {snapshotChangeCount(comparison.diff) > 0 ? <div className={styles.changeList}>{[['Added resources', comparison.diff.nodes.added], ['Removed resources', comparison.diff.nodes.removed], ['Changed resources', comparison.diff.nodes.changed.map((item) => item.after)], ['Added relationships', comparison.diff.edges.added], ['Removed relationships', comparison.diff.edges.removed], ['Changed relationships', comparison.diff.edges.changed.map((item) => item.after)]].filter(([, items]) => items.length).map(([label, items]) => <div key={label}><strong>{label}</strong><span>{items.map((item) => item.source ? `${item.label || item.id} (${item.source} → ${item.target})` : item.label || item.id).join(' · ')}</span></div>)}</div> : null}
          </section> : selectedNode ? <><div className={styles.inspectorHeader}><div className={styles.resourceType}><i style={{ backgroundColor: selectedService.fallbackColor }} />{selectedService.heading}</div><button className={styles.closeButton} type="button" onClick={() => setSelectedNode(null)} aria-label="Close resource details"><Icon name="close" size={15} /></button></div><h2>{selectedNode.label || getResourceId(selectedNode.id)}</h2>{selectedNodeHidden ? <p className={styles.filteredSelectionNote}>Hidden by the current filter</p> : null}<dl className={styles.detailsList}><div><dt>Resource ID</dt><dd>{getResourceId(selectedNode.id)}</dd></div><div><dt>Resource type</dt><dd>{selectedService.heading}</dd></div>{Object.entries(selectedNode.details || {}).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatDetailValue(value)}</dd></div>)}<div><dt>Region</dt><dd>{selectedNode.region || topologyContext?.region || 'unknown'}</dd></div><div><dt>Profile</dt><dd>{topologyContext?.profile || 'unknown'}</dd></div></dl></> : selectedEdge ? <><div className={styles.inspectorHeader}><div className={styles.resourceType}><i style={{ backgroundColor: '#4f83cc' }} />Relationship</div><button className={styles.closeButton} type="button" onClick={() => setSelectedEdge(null)} aria-label="Close relationship details"><Icon name="close" size={15} /></button></div><h2>{selectedEdge.label}</h2>{selectedEdgeHidden ? <p className={styles.filteredSelectionNote}>Hidden by the current filter</p> : null}<dl className={styles.detailsList}><div><dt>From</dt><dd>{selectedEdge.source}</dd></div><div><dt>To</dt><dd>{selectedEdge.target}</dd></div></dl></> : <div className={styles.inspectorEmpty}><span><Icon name="info" size={20} /></span><h2>Topology details</h2><p>Select a node or connection to inspect its full details.</p></div>}
        </aside>
        </div>
      </div>
      </div>
      {pendingPlanImport ? <div className={styles.dialogBackdrop} role="presentation">
        <section className={styles.importDialog} role="dialog" aria-modal="true" aria-labelledby="import-plan-title">
          <span className={styles.dialogIcon}><Icon name="layers" size={20} /></span>
          <h2 id="import-plan-title">Planning canvas already has work</h2>
          <p>Choose how to add this live snapshot to your plan.</p>
          <div className={styles.importSummary}><span>{pendingPlanImport.nodes.length} resources</span><span>{pendingPlanImport.edges.length} relationships</span></div>
          <div className={styles.importChoices}>
            <button className={styles.importChoice} type="button" onClick={() => finishPlanImport('append')}><strong>Append to canvas</strong><span>Keep your work and add resources that are not already in the plan.</span></button>
            <button className={`${styles.importChoice} ${styles.importChoicePrimary}`} type="button" onClick={() => finishPlanImport('replace')}><strong>Replace canvas</strong><span>Start a new plan using this snapshot.</span></button>
          </div>
          <div className={styles.dialogActions}><button className={styles.secondaryBtn} type="button" onClick={() => finishPlanImport('cancel')}>Cancel</button></div>
        </section>
      </div> : null}
    </section>
  </main>;
}
