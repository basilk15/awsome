import Head from 'next/head';
import { useCallback, useMemo, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';

const SERVICE_MAP = {
  vpc: {
    heading: 'VPC',
    icon: 'Virtual Private Cloud.png',
    fallbackColor: '#14b8a6'
  },
  subnet: {
    heading: 'Subnet',
    icon: 'Virtual Private Cloud.png',
    fallbackColor: '#8b5cf6'
  },
  ec2: {
    heading: 'EC2 Instance',
    icon: 'EC2.png',
    fallbackColor: '#f97316'
  },
  rds: {
    heading: 'RDS Instance',
    icon: 'RDS.png',
    fallbackColor: '#3b82f6'
  },
  sg: {
    heading: 'Security Group',
    icon: 'EC2.png',
    fallbackColor: '#ef476f'
  }
};

const EDGE_TEXT_BY_RELATION = {
  'vpc->subnet': 'Subnet belongs to VPC',
  'subnet->ec2': 'EC2 hosted in Subnet',
  'ec2->sg': 'Security Group attached to EC2',
  'subnet->rds': 'RDS associated with Subnet Group',
  'rds->sg': 'Security Group attached to RDS'
};

function getNodeTypeFromId(id) {
  if (typeof id !== 'string') {
    return '';
  }

  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(0, dash) : '';
}

function getResourceId(id) {
  if (typeof id !== 'string') {
    return '';
  }

  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(dash + 1) : id;
}

function buildNodeMetadata(nodeData, type) {
  const metadata = [];
  const rawId = getResourceId(nodeData.id);

  if (type === 'subnet') {
    metadata.push(`ID: ${rawId}`);
  } else if (type === 'ec2') {
    metadata.push(`ID: ${rawId}`);
  } else if (type === 'sg') {
    metadata.push(`ID: ${rawId}`);
  } else if (type === 'vpc') {
    metadata.push(`ID: ${rawId}`);
  } else if (type === 'rds') {
    metadata.push(`ID: ${rawId}`);
  }

  return metadata;
}

function toDisplayNode(node) {
  const nodeData = node && typeof node.data === 'object' ? node.data : {};
  const type = nodeData.type || getNodeTypeFromId(nodeData.id);
  const service = SERVICE_MAP[type] || {
    heading: 'AWS Resource',
    icon: 'Virtual Private Cloud.png',
    fallbackColor: '#4f83cc'
  };

  const resourceName = (nodeData.label && String(nodeData.label)) || getResourceId(nodeData.id) || 'Unknown';
  const metadata = buildNodeMetadata(nodeData, type);
  const lines = [service.heading, resourceName, ...metadata];

  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 10);
  const lineCount = lines.length;
  const nodeWidth = Math.min(430, Math.max(220, Math.round(longestLine * 7.6 + 44)));
  const nodeHeight = Math.min(290, Math.max(156, 116 + (lineCount - 2) * 22));

  return {
    ...node,
    data: {
      ...nodeData,
      type,
      icon: `/assets/${service.icon}`,
      fallbackColor: service.fallbackColor,
      displayLabel: lines.join('\n'),
      nodeWidth,
      nodeHeight,
      textMaxWidth: Math.max(140, nodeWidth - 26)
    }
  };
}

function toDisplayEdge(edge) {
  const edgeData = edge && typeof edge.data === 'object' ? edge.data : {};
  const relationKey = `${getNodeTypeFromId(edgeData.source)}->${getNodeTypeFromId(edgeData.target)}`;

  return {
    ...edge,
    data: {
      ...edgeData,
      displayLabel: EDGE_TEXT_BY_RELATION[relationKey] || edgeData.label || 'AWS relationship'
    }
  };
}

export default function Home() {
  const [entered, setEntered] = useState(false);
  const [profile, setProfile] = useState('default');
  const [region, setRegion] = useState('ap-southeast-2');
  const [status, setStatus] = useState('Ready. Enter profile/region and click Load Topology.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cyContainerRef = useRef(null);
  const cyInstanceRef = useRef(null);

  const canFetchTopology = useMemo(
    () => typeof window !== 'undefined' && window.awsAPI && typeof window.awsAPI.fetchTopology === 'function',
    []
  );

  const destroyGraph = useCallback(() => {
    if (cyInstanceRef.current) {
      cyInstanceRef.current.destroy();
      cyInstanceRef.current = null;
    }
  }, []);

  const applyZoomedFit = useCallback(() => {
    if (!cyInstanceRef.current) {
      return;
    }

    const cy = cyInstanceRef.current;
    cy.resize();
    cy.fit(cy.elements(), 22);
    cy.zoom(Math.min(cy.maxZoom(), cy.zoom() * 1.58));
    cy.center();
  }, []);

  const renderGraph = useCallback(
    async (graph, attempt = 0) => {
      if (!cyContainerRef.current) {
        throw new Error('Graph container not available');
      }

      const width = cyContainerRef.current.clientWidth;
      const height = cyContainerRef.current.clientHeight;

      if ((width === 0 || height === 0) && attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return renderGraph(graph, attempt + 1);
      }

      const cytoscape = (await import('cytoscape')).default;
      destroyGraph();

      const nodes = Array.isArray(graph?.nodes) ? graph.nodes.map(toDisplayNode) : [];
      const edges = Array.isArray(graph?.edges) ? graph.edges.map(toDisplayEdge) : [];

      const cy = cytoscape({
        container: cyContainerRef.current,
        elements: { nodes, edges },
        style: [
          {
            selector: 'node',
            style: {
              shape: 'round-rectangle',
              width: 'data(nodeWidth)',
              height: 'data(nodeHeight)',
              'background-color': 'data(fallbackColor)',
              'background-image': 'data(icon)',
              'background-fit': 'contain',
              'background-width': '46px',
              'background-height': '46px',
              'background-position-x': '50%',
              'background-position-y': '22%',
              'background-repeat': 'no-repeat',
              'background-opacity': 0.23,
              label: 'data(displayLabel)',
              color: '#eaf2ff',
              'font-size': 12,
              'font-weight': 650,
              'line-height': 1.33,
              'text-wrap': 'wrap',
              'text-max-width': 'data(textMaxWidth)',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'text-margin-y': -10,
              'text-justification': 'center',
              'border-width': 2,
              'border-color': '#9db5db',
              'overlay-opacity': 0,
              padding: '15px',
              'shadow-color': '#0b152b',
              'shadow-blur': 12,
              'shadow-opacity': 0.3,
              'shadow-offset-x': 0,
              'shadow-offset-y': 5,
              'transition-property': 'border-color, border-width, shadow-blur, shadow-opacity',
              'transition-duration': '180ms'
            }
          },
          {
            selector: 'node.hovered',
            style: {
              'border-color': '#90deff',
              'border-width': 3.2,
              'shadow-color': '#6ed2ff',
              'shadow-blur': 22,
              'shadow-opacity': 0.58
            }
          },
          {
            selector: 'node.connected-node',
            style: {
              'border-color': '#7bc1ff',
              'shadow-opacity': 0.42
            }
          },
          {
            selector: 'node:selected',
            style: {
              'border-color': '#59c3ff',
              'border-width': 3.6,
              'shadow-color': '#5ecbff',
              'shadow-blur': 25,
              'shadow-opacity': 0.65
            }
          },
          {
            selector: 'edge',
            style: {
              width: 2.8,
              'line-color': '#8da3c4',
              'target-arrow-color': '#8da3c4',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 1.26,
              'curve-style': 'bezier',
              'control-point-step-size': 48,
              label: 'data(displayLabel)',
              color: '#edf4ff',
              'font-size': 15,
              'font-weight': 700,
              'text-wrap': 'wrap',
              'text-max-width': 340,
              'text-background-color': 'rgba(6, 14, 30, 0.76)',
              'text-background-opacity': 1,
              'text-background-shape': 'roundrectangle',
              'text-background-padding': '7px',
              'text-border-opacity': 0,
              'text-rotation': 'autorotate',
              'text-margin-y': -8,
              'overlay-opacity': 0,
              'transition-property': 'line-color, target-arrow-color, width, text-background-color',
              'transition-duration': '180ms'
            }
          },
          {
            selector: 'edge.connected-hover',
            style: {
              width: 3.9,
              'line-color': '#89daff',
              'target-arrow-color': '#89daff',
              'text-background-color': 'rgba(15, 30, 58, 0.92)'
            }
          },
          {
            selector: 'edge:selected',
            style: {
              width: 4.2,
              'line-color': '#7fc8ff',
              'target-arrow-color': '#7fc8ff'
            }
          }
        ],
        layout: {
          name: 'cose',
          animate: true,
          animationDuration: 700,
          fit: true,
          padding: 24,
          spacingFactor: 1.62,
          nodeRepulsion: 9800,
          idealEdgeLength: 170,
          edgeElasticity: 95,
          gravity: 0.82,
          numIter: 1400
        },
        minZoom: 0.3,
        maxZoom: 6,
        wheelSensitivity: 0.56
      });

      cyInstanceRef.current = cy;

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
      });

      cy.on('mouseout', 'edge', (event) => {
        event.target.removeClass('connected-hover');
      });

      cy.one('layoutstop', () => {
        applyZoomedFit();
      });

      setTimeout(applyZoomedFit, 900);
      setTimeout(applyZoomedFit, 1700);
    },
    [applyZoomedFit, destroyGraph]
  );

  const fetchTopology = useCallback(
    async (isRefresh) => {
      if (!canFetchTopology) {
        setError('Renderer bridge not available. Restart Graphivo from Electron.');
        return;
      }

      setError('');
      setLoading(true);
      setStatus(isRefresh ? 'Refreshing topology from AWS...' : 'Loading topology from AWS...');

      try {
        const graph = await window.awsAPI.fetchTopology({ profile, region });
        await renderGraph(graph, 0);
        setStatus(`Topology loaded successfully: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
      } catch (err) {
        const message = err?.message || String(err);
        setError(`Failed to load topology: ${message}`);
        setStatus('Failed to load topology. Review error details above.');
      } finally {
        setLoading(false);
      }
    },
    [canFetchTopology, profile, region, renderGraph]
  );

  return (
    <>
      <Head>
        <title>Graphivo</title>
      </Head>

      <main className={styles.appShell}>
        {!entered ? (
          <section className={styles.landingView}>
            <div className={`${styles.landingOrb} ${styles.orbA}`} />
            <div className={`${styles.landingOrb} ${styles.orbB}`} />
            <div className={styles.landingCard}>
              <h1 className={styles.landingTitle}>Graphivo</h1>
              <p className={styles.landingSubtitle}>Visualize Your AWS Infrastructure Instantly</p>
              <p className={styles.landingDescription}>
                Explore live AWS relationships with a fast graph experience optimized for clarity,
                density, and deep interactive inspection.
              </p>
              <button className={styles.primaryBtn} onClick={() => setEntered(true)}>
                Enter App
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.mainView}>
            <div className={styles.toolbarCard}>
              <div className={styles.fieldGroup}>
                <label>AWS Profile</label>
                <input value={profile} onChange={(e) => setProfile(e.target.value)} disabled={loading} />
              </div>

              <div className={styles.fieldGroup}>
                <label>Region</label>
                <input value={region} onChange={(e) => setRegion(e.target.value)} disabled={loading} />
              </div>

              <div className={styles.actionsGroup}>
                <button className={styles.primaryBtn} disabled={loading} onClick={() => fetchTopology(false)}>
                  {loading ? 'Loading...' : 'Load Topology'}
                </button>
                <button className={styles.secondaryBtn} disabled={loading} onClick={() => fetchTopology(true)}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <div className={`${styles.spinner} ${!loading ? styles.spinnerHidden : ''}`} />
              </div>
            </div>

            {error ? <div className={styles.errorBanner}>{error}</div> : null}
            <div className={styles.status}>{status}</div>

            <div className={styles.graphPanel}>
              <div ref={cyContainerRef} className={styles.cy} />
            </div>
          </section>
        )}
      </main>
    </>
  );
}
