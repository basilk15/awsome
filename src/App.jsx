import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';
import ec2Icon from 'aws-icons/icons/architecture-service/AmazonEC2.svg';
import lambdaIcon from 'aws-icons/icons/architecture-service/AWSLambda.svg';
import ecsIcon from 'aws-icons/icons/architecture-service/AmazonElasticContainerService.svg';
import eksIcon from 'aws-icons/icons/architecture-service/AmazonElasticKubernetesService.svg';
import fargateIcon from 'aws-icons/icons/architecture-service/AWSFargate.svg';
import beanstalkIcon from 'aws-icons/icons/architecture-service/AWSElasticBeanstalk.svg';
import batchIcon from 'aws-icons/icons/architecture-service/AWSBatch.svg';
import s3Icon from 'aws-icons/icons/architecture-service/AmazonSimpleStorageService.svg';
import ebsIcon from 'aws-icons/icons/architecture-service/AmazonElasticBlockStore.svg';
import efsIcon from 'aws-svg-icons/lib/Architecture-Service-Icons_07302021/Arch_Storage/32/Arch_Amazon-Elastic-File-System_32.svg';
import fsxIcon from 'aws-icons/icons/architecture-service/AmazonFSx.svg';
import gatewayIcon from 'aws-icons/icons/architecture-service/AWSStorageGateway.svg';
import rdsIcon from 'aws-icons/icons/architecture-service/AmazonRDS.svg';
import auroraIcon from 'aws-icons/icons/architecture-service/AmazonAurora.svg';
import dynamodbIcon from 'aws-icons/icons/architecture-service/AmazonDynamoDB.svg';
import elasticacheIcon from 'aws-icons/icons/architecture-service/AmazonElastiCache.svg';
import redshiftIcon from 'aws-icons/icons/architecture-service/AmazonRedshift.svg';
import neptuneIcon from 'aws-icons/icons/architecture-service/AmazonNeptune.svg';
import vpcIcon from 'aws-icons/icons/architecture-service/AmazonVirtualPrivateCloud.svg';
import elbIcon from 'aws-icons/icons/architecture-service/ElasticLoadBalancing.svg';
import cloudfrontIcon from 'aws-icons/icons/architecture-service/AmazonCloudFront.svg';
import route53Icon from 'aws-icons/icons/architecture-service/AmazonRoute53.svg';
import apiIcon from 'aws-icons/icons/architecture-service/AmazonAPIGateway.svg';
import transitIcon from 'aws-icons/icons/architecture-service/AWSTransitGateway.svg';
import iamIcon from 'aws-icons/icons/architecture-service/AWSIdentityandAccessManagement.svg';
import kmsIcon from 'aws-icons/icons/architecture-service/AWSKeyManagementService.svg';
import wafIcon from 'aws-icons/icons/architecture-service/AWSWAF.svg';
import secretsIcon from 'aws-icons/icons/architecture-service/AWSSecretsManager.svg';
import cognitoIcon from 'aws-icons/icons/architecture-service/AmazonCognito.svg';
import sqsIcon from 'aws-icons/icons/architecture-service/AmazonSimpleQueueService.svg';
import snsIcon from 'aws-icons/icons/architecture-service/AmazonSimpleNotificationService.svg';
import eventbridgeIcon from 'aws-icons/icons/architecture-service/AmazonEventBridge.svg';
import stepfunctionsIcon from 'aws-icons/icons/architecture-service/AWSStepFunctions.svg';
import athenaIcon from 'aws-icons/icons/architecture-service/AmazonAthena.svg';
import glueIcon from 'aws-icons/icons/architecture-service/AWSGlue.svg';
import kinesisIcon from 'aws-icons/icons/architecture-service/AmazonKinesis.svg';
import opensearchIcon from 'aws-icons/icons/architecture-service/AmazonOpenSearchService.svg';
import quicksightIcon from 'aws-svg-icons/lib/Architecture-Service-Icons_07302021/Arch_Analytics/Arch_32/Arch_Amazon-QuickSight_32.svg';
import cloudwatchIcon from 'aws-icons/icons/architecture-service/AmazonCloudWatch.svg';
import cloudformationIcon from 'aws-icons/icons/architecture-service/AWSCloudFormation.svg';
import cloudtrailIcon from 'aws-icons/icons/architecture-service/AWSCloudTrail.svg';
import ssmIcon from 'aws-icons/icons/architecture-service/AWSSystemsManager.svg';
import bedrockIcon from 'aws-icons/icons/architecture-service/AmazonBedrock.svg';
import sagemakerIcon from 'aws-icons/icons/architecture-service/AmazonSageMakerAI.svg';
import rekognitionIcon from 'aws-icons/icons/architecture-service/AmazonRekognition.svg';
import Landing from './Landing';
import usePlanningDocument from './usePlanningDocument';

const SERVICE_MAP = {
  vpc: { heading: 'VPC', icon: 'aws/amazon-vpc.svg', fallbackColor: '#7b3fe4' },
  subnet: { heading: 'Subnet', icon: 'none', fallbackColor: '#8f67d8' },
  ec2: { heading: 'EC2 Instance', icon: 'aws/ec2.svg', fallbackColor: '#ec7211' },
  rds: { heading: 'RDS Instance', icon: 'aws/rds.svg', fallbackColor: '#3b48cc' },
  sg: { heading: 'Security Group', icon: 'none', fallbackColor: '#64748b' }
};

const PLANNING_SERVICES = [
  ['Compute', 'Amazon EC2', 'ec2', '#ec7211'], ['Compute', 'AWS Lambda', 'lambda', '#ff9900'], ['Compute', 'Amazon ECS', 'ecs', '#d86613'], ['Compute', 'Amazon EKS', 'eks', '#326ce5'], ['Compute', 'AWS Fargate', 'fargate', '#ec7211'], ['Compute', 'Elastic Beanstalk', 'beanstalk', '#3f8624'], ['Compute', 'AWS Batch', 'batch', '#ec7211'],
  ['Storage', 'Amazon S3', 's3', '#569a31'], ['Storage', 'Amazon EBS', 'ebs', '#e7157b'], ['Storage', 'Amazon EFS', 'efs', '#8c4fff'], ['Storage', 'Amazon FSx', 'fsx', '#df3312'], ['Storage', 'Storage Gateway', 'gateway', '#569a31'],
  ['Database', 'Amazon RDS', 'rds', '#3b48cc'], ['Database', 'Amazon Aurora', 'aurora', '#3b48cc'], ['Database', 'Amazon DynamoDB', 'dynamodb', '#4053d6'], ['Database', 'Amazon ElastiCache', 'elasticache', '#c925d1'], ['Database', 'Amazon Redshift', 'redshift', '#8b3eb8'], ['Database', 'Amazon Neptune', 'neptune', '#00a1c9'],
  ['Networking', 'Amazon VPC', 'vpc', '#7b3fe4'], ['Networking', 'Elastic Load Balancing', 'elb', '#8c4fff'], ['Networking', 'Amazon CloudFront', 'cloudfront', '#8c4fff'], ['Networking', 'Amazon Route 53', 'route53', '#8c4fff'], ['Networking', 'Amazon API Gateway', 'api', '#8c4fff'], ['Networking', 'AWS Transit Gateway', 'transit', '#8c4fff'],
  ['Security', 'AWS IAM', 'iam', '#dd344c'], ['Security', 'AWS KMS', 'kms', '#dd344c'], ['Security', 'AWS WAF', 'waf', '#dd344c'], ['Security', 'AWS Secrets Manager', 'secrets', '#dd344c'], ['Security', 'Amazon Cognito', 'cognito', '#dd344c'],
  ['Integration', 'Amazon SQS', 'sqs', '#e7157b'], ['Integration', 'Amazon SNS', 'sns', '#e7157b'], ['Integration', 'Amazon EventBridge', 'eventbridge', '#e7157b'], ['Integration', 'AWS Step Functions', 'stepfunctions', '#e7157b'],
  ['Analytics', 'Amazon Athena', 'athena', '#2ca6ad'], ['Analytics', 'AWS Glue', 'glue', '#2ca6ad'], ['Analytics', 'Amazon Kinesis', 'kinesis', '#2ca6ad'], ['Analytics', 'Amazon OpenSearch', 'opensearch', '#2ca6ad'], ['Analytics', 'Amazon QuickSight', 'quicksight', '#2ca6ad'],
  ['Management', 'Amazon CloudWatch', 'cloudwatch', '#e7157b'], ['Management', 'AWS CloudFormation', 'cloudformation', '#e7157b'], ['Management', 'AWS CloudTrail', 'cloudtrail', '#e7157b'], ['Management', 'AWS Systems Manager', 'ssm', '#e7157b'],
  ['AI / ML', 'Amazon Bedrock', 'bedrock', '#01a88d'], ['AI / ML', 'Amazon SageMaker', 'sagemaker', '#01a88d'], ['AI / ML', 'Amazon Rekognition', 'rekognition', '#01a88d']
].map(([category, name, key, color]) => ({ category, name, key, color }));

const PLANNING_ICON_PATHS = {
  ec2: ec2Icon, lambda: lambdaIcon, ecs: ecsIcon, eks: eksIcon, fargate: fargateIcon, beanstalk: beanstalkIcon, batch: batchIcon,
  s3: s3Icon, ebs: ebsIcon, efs: efsIcon, fsx: fsxIcon, gateway: gatewayIcon,
  rds: rdsIcon, aurora: auroraIcon, dynamodb: dynamodbIcon, elasticache: elasticacheIcon, redshift: redshiftIcon, neptune: neptuneIcon,
  vpc: vpcIcon, elb: elbIcon, cloudfront: cloudfrontIcon, route53: route53Icon, api: apiIcon, transit: transitIcon,
  iam: iamIcon, kms: kmsIcon, waf: wafIcon, secrets: secretsIcon, cognito: cognitoIcon,
  sqs: sqsIcon, sns: snsIcon, eventbridge: eventbridgeIcon, stepfunctions: stepfunctionsIcon,
  athena: athenaIcon, glue: glueIcon, kinesis: kinesisIcon, opensearch: opensearchIcon, quicksight: quicksightIcon,
  cloudwatch: cloudwatchIcon, cloudformation: cloudformationIcon, cloudtrail: cloudtrailIcon, ssm: ssmIcon,
  bedrock: bedrockIcon, sagemaker: sagemakerIcon, rekognition: rekognitionIcon
};

const PLANNING_SERVICE_DETAILS = {
  ec2: ['Resizable virtual servers for applications and workloads.', 'Run web apps, APIs, batch jobs, or self-managed software.'],
  lambda: ['Serverless compute that runs code in response to events.', 'Process uploads, run scheduled jobs, and build event-driven APIs.'],
  ecs: ['Managed container orchestration for Docker workloads.', 'Deploy containerized web services and background workers.'],
  eks: ['Managed Kubernetes control plane on AWS.', 'Run Kubernetes applications with AWS networking and identity integration.'],
  fargate: ['Serverless compute capacity for containers.', 'Run containers without managing EC2 hosts or cluster capacity.'],
  beanstalk: ['Platform service for deploying web applications.', 'Launch web apps quickly with managed scaling, load balancing, and health checks.'],
  batch: ['Managed scheduling and execution for batch workloads.', 'Run large-scale ETL, simulations, and queue-driven processing.'],
  s3: ['Highly durable object storage for files and data.', 'Store uploads, static websites, backups, data lakes, and media.'],
  ebs: ['Persistent block storage for EC2 instances.', 'Attach database volumes or durable disks to virtual servers.'],
  efs: ['Elastic shared file storage for Linux workloads.', 'Share files across EC2, containers, and serverless workloads.'],
  fsx: ['Managed high-performance file systems.', 'Run Windows, Lustre, NetApp, or OpenZFS file workloads.'],
  gateway: ['Hybrid storage bridge between on-premises systems and AWS.', 'Extend local backup, file, and tape workflows into AWS storage.'],
  rds: ['Managed relational databases with automated operations.', 'Host application databases with backups, patching, and high availability.'],
  aurora: ['Cloud-native relational database compatible with MySQL and PostgreSQL.', 'Run high-throughput transactional applications with managed scaling.'],
  dynamodb: ['Serverless NoSQL key-value and document database.', 'Serve low-latency application state, sessions, catalogs, and events.'],
  elasticache: ['In-memory cache and data store service.', 'Cache database reads, manage sessions, and power real-time features.'],
  redshift: ['Managed cloud data warehouse.', 'Analyze large business datasets with SQL and BI tools.'],
  neptune: ['Managed graph database service.', 'Model relationships for fraud detection, recommendations, and knowledge graphs.'],
  vpc: ['Isolated virtual network for AWS resources.', 'Define subnets, routing, security boundaries, and private connectivity.'],
  elb: ['Managed load balancers for distributing application traffic.', 'Route requests across healthy instances, containers, or IP targets.'],
  cloudfront: ['Global content delivery network.', 'Accelerate websites, APIs, video, and downloads at edge locations.'],
  route53: ['Scalable DNS and traffic routing service.', 'Manage domains, health checks, and failover or latency-based routing.'],
  api: ['Managed service for publishing and securing APIs.', 'Expose REST, HTTP, and WebSocket APIs to clients and partners.'],
  transit: ['Central hub for VPC and on-premises network connectivity.', 'Connect many VPCs and hybrid networks through a shared routing layer.'],
  iam: ['Identity and access management for AWS resources.', 'Control who can sign in and what people or workloads can do.'],
  kms: ['Managed service for creating and controlling encryption keys.', 'Encrypt application data, secrets, disks, databases, and S3 objects.'],
  waf: ['Web application firewall for HTTP(S) traffic.', 'Block malicious requests and protect public websites and APIs.'],
  secrets: ['Managed storage and rotation for sensitive values.', 'Keep database credentials, API keys, and tokens out of code.'],
  cognito: ['Managed authentication and user identity service.', 'Add sign-up, sign-in, MFA, and federation to customer-facing apps.'],
  sqs: ['Durable managed message queues.', 'Decouple services and absorb bursts in asynchronous workloads.'],
  sns: ['Managed publish-subscribe notifications.', 'Fan out events to queues, functions, email, SMS, and HTTPS endpoints.'],
  eventbridge: ['Serverless event bus for AWS and SaaS events.', 'Connect application events to downstream workflows and services.'],
  stepfunctions: ['Visual workflow orchestration service.', 'Coordinate multi-step processes, retries, approvals, and long-running jobs.'],
  athena: ['Serverless SQL queries directly over data in S3.', 'Explore logs and data-lake files without provisioning a database.'],
  glue: ['Serverless data integration and ETL service.', 'Prepare, catalog, and transform data for analytics and ML.'],
  kinesis: ['Managed streaming data platform.', 'Ingest and process events, clickstreams, telemetry, and logs in real time.'],
  opensearch: ['Managed search and analytics engine.', 'Power full-text search, log analytics, and observability dashboards.'],
  quicksight: ['Cloud business intelligence and dashboard service.', 'Share interactive analytics dashboards with business users.'],
  cloudwatch: ['Monitoring, logs, metrics, alarms, and dashboards.', 'Observe applications, trigger alerts, and troubleshoot production systems.'],
  cloudformation: ['Infrastructure as code for AWS resources.', 'Create repeatable environments from version-controlled templates.'],
  cloudtrail: ['Audit trail of AWS API activity and account events.', 'Investigate changes, support compliance, and monitor account actions.'],
  ssm: ['Operational management tools for AWS and hybrid resources.', 'Patch servers, manage parameters, run commands, and automate operations.'],
  bedrock: ['Managed foundation models and generative AI capabilities.', 'Build AI assistants, content generation, and retrieval-augmented applications.'],
  sagemaker: ['Managed platform for building and deploying machine learning.', 'Train models, run notebooks, and host inference endpoints.'],
  rekognition: ['AI service for image and video analysis.', 'Detect labels, text, faces, and unsafe content in media workflows.']
};

const DEFAULT_PLANNING_NODE_WIDTH = 168;
const DEFAULT_PLANNING_NODE_HEIGHT = 84;
const MIN_PLANNING_NODE_WIDTH = 126;
const MIN_PLANNING_NODE_HEIGHT = 68;
const MIN_PLANNING_ZOOM = 0.6;
const MAX_PLANNING_ZOOM = 1.55;
const PLANNING_CANVAS_SIZE = 3000;

function getWheelZoomFactor(event) {
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  return Math.exp(-Math.max(-180, Math.min(180, delta)) * 0.0012);
}

function getPlanningNodeVisualStyle(node) {
  const widthRatio = (node.width || DEFAULT_PLANNING_NODE_WIDTH) / DEFAULT_PLANNING_NODE_WIDTH;
  const heightRatio = (node.height || DEFAULT_PLANNING_NODE_HEIGHT) / DEFAULT_PLANNING_NODE_HEIGHT;
  const scale = Math.min(2.2, Math.max(0.85, Math.sqrt(widthRatio * heightRatio)));
  return {
    '--node-icon-size': `${Math.round(38 * scale)}px`,
    '--node-icon-image-size': `${Math.round(28 * scale)}px`,
    '--node-icon-radius': `${Math.round(8 * scale)}px`,
    '--node-label-size': `${Math.round(12 * scale * 10) / 10}px`,
    '--node-content-gap': `${Math.round(9 * scale)}px`,
    '--node-content-padding': `${Math.round(10 * Math.min(scale, 1.55))}px`
  };
}

const EDGE_TEXT_BY_RELATION = {
  'vpc->subnet': 'Subnet belongs to VPC',
  'vpc->sg': 'Security group belongs to VPC',
  'subnet->ec2': 'EC2 hosted in Subnet',
  'ec2->sg': 'Security Group attached to EC2',
  'subnet->rds': 'RDS associated with Subnet Group',
  'rds->sg': 'Security Group attached to RDS'
};

function getNodeTypeFromId(id) {
  if (typeof id !== 'string') return '';
  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(0, dash) : '';
}

function getResourceId(id) {
  if (typeof id !== 'string') return '';
  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(dash + 1) : id;
}

function toDisplayNode(node) {
  const nodeData = node && typeof node.data === 'object' ? node.data : {};
  const type = nodeData.type || getNodeTypeFromId(nodeData.id);
  const service = SERVICE_MAP[type] || { heading: 'AWS Resource', icon: 'aws/vpc.svg', fallbackColor: '#4f83cc' };
  const resourceName = (nodeData.label && String(nodeData.label)) || getResourceId(nodeData.id) || 'Unknown';
  const rawId = getResourceId(nodeData.id);
  const lines = resourceName === rawId ? [service.heading, rawId] : [resourceName, rawId];
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 10);
  const compact = service.icon === 'none';
  const nodeWidth = compact ? Math.min(205, Math.max(148, Math.round(longestLine * 5.8 + 28))) : Math.min(210, Math.max(160, Math.round(longestLine * 5.8 + 28)));
  const nodeHeight = compact ? 82 : 132;
  return {
    ...node,
    data: {
      ...nodeData,
      type,
      icon: compact ? 'none' : `/assets/${service.icon}`,
      fallbackColor: service.fallbackColor,
      compact: compact ? 'yes' : 'no',
      displayLabel: lines.join('\n'),
      nodeWidth,
      nodeHeight,
      textMaxWidth: Math.max(112, nodeWidth - 18)
    }
  };
}

function toDisplayEdge(edge) {
  const edgeData = edge && typeof edge.data === 'object' ? edge.data : {};
  const relationKey = `${getNodeTypeFromId(edgeData.source)}->${getNodeTypeFromId(edgeData.target)}`;
  return { ...edge, data: { ...edgeData, displayLabel: EDGE_TEXT_BY_RELATION[relationKey] || edgeData.label || 'AWS relationship' } };
}

function Icon({ name, size = 16 }) {
  const paths = {
    network: <><circle cx="4.5" cy="6" r="2" /><circle cx="15.5" cy="5" r="2" /><circle cx="10" cy="16" r="2" /><path d="m6.2 7.2 2.5 6.8M13.8 6.3l-2.5 7.4M6.5 6.3l7 0" /></>,
    refresh: <><path d="M18 8a6.6 6.6 0 0 0-11.2-2L5 8" /><path d="M5 4v4h4M6 16a6.6 6.6 0 0 0 11.2 2L19 16" /><path d="M19 20v-4h-4" /></>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" /><path d="M3 8l5-5M16 3l5 5M3 16l5 5M16 21l5-5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    database: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>,
    cloud: <path d="M17.5 18.5H7a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 12a3.3 3.3 0 0 1-1.5 6.5Z" />,
    grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
    cursor: <path d="m5 3 14 8-6.2 1.8L11 19z" />,
    link: <><path d="M10.3 13.7a4 4 0 0 0 5.7.1l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3" /><path d="M13.7 10.3a4 4 0 0 0-5.7-.1l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3" /></>,
    search: <><circle cx="10.5" cy="10.5" r="5.7" /><path d="m15 15 4.2 4.2" /></>,
    layers: <><path d="m12 3 8.4 4.6L12 12.2 3.6 7.6zM3.6 12.1 12 16.7l8.4-4.6M3.6 16.6 12 21.2l8.4-4.6" /></>,
    chevronDown: <path d="m7 10 5 5 5-5" />,
    resizeHorizontal: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M3 12h18" /></>,
    resizeDiagonal: <><path d="M8 16 16 8M11 17h6v-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    download: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M5 20h14" /></>,
    upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 20h14" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.8v5.1M12 7.8h.01" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>;
}

function PlanningServiceIcon({ service, small = false }) {
  const src = PLANNING_ICON_PATHS[service.key];
  return <span className={`${styles.serviceIcon} ${small ? styles.serviceIconSmall : ''}`} style={{ '--service-color': service.color }}>
    {src ? <img src={src} alt="" /> : <span>{service.name.replace('Amazon ', '').replace('AWS ', '').split(' ').map((word) => word[0]).join('').slice(0, 2)}</span>}
  </span>;
}

function PlanningWorkspace() {
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
    exportArchitecture
  } = usePlanningDocument(PLANNING_SERVICES);
  const [selectedId, setSelectedId] = useState(null);
  const [connectionSource, setConnectionSource] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [paletteWidth, setPaletteWidth] = useState(252);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [removalHover, setRemovalHover] = useState(false);
  const [nameDraft, setNameDraft] = useState(planningDocument.name);
  const canvasRef = useRef(null);
  const importInputRef = useRef(null);
  const nodeInteractionRef = useRef(null);
  const canvasPanInteractionRef = useRef(null);
  const canvasPanDidMoveRef = useRef(false);
  const paletteResizeRef = useRef(null);
  const categoryPickerRef = useRef(null);
  const paletteRef = useRef(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categories = ['All', ...new Set(PLANNING_SERVICES.map((service) => service.category))];
  const query = search.trim().toLowerCase();
  const availableServices = PLANNING_SERVICES.filter((service) => (selectedCategory === 'All' || service.category === selectedCategory) && (!query || service.name.toLowerCase().includes(query)));
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedNodeService = selectedNode ? PLANNING_SERVICES.find((service) => service.key === selectedNode.serviceKey) : null;
  const selectedServiceDetails = selectedNode ? PLANNING_SERVICE_DETAILS[selectedNode.serviceKey] : null;

  useEffect(() => {
    setNameDraft(planningDocument.name);
    setSelectedId(null);
    setConnectionSource(null);
  }, [planningDocument.id, planningDocument.name]);

  const commitDocumentName = () => {
    if (!renameDocument(nameDraft)) setNameDraft(planningDocument.name);
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
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = getWheelZoomFactor(event);
    setCanvasZoom((zoom) => Math.max(MIN_PLANNING_ZOOM, Math.min(MAX_PLANNING_ZOOM, Number((zoom * factor).toFixed(3)))));
  }, []);

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
    const handleShortcut = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const zoomIn = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract';
      if (zoomIn || zoomOut || event.key === '0') event.preventDefault();
      if (zoomIn) setCanvasZoom((zoom) => Math.min(MAX_PLANNING_ZOOM, Number((zoom + 0.1).toFixed(2))));
      if (zoomOut) setCanvasZoom((zoom) => Math.max(MIN_PLANNING_ZOOM, Number((zoom - 0.1).toFixed(2))));
      if (event.key === '0') setCanvasZoom(1);
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
      x: (event.clientX - rect.left - canvasPan.x) / canvasZoom - (DEFAULT_PLANNING_NODE_WIDTH / 2),
      y: (event.clientY - rect.top - canvasPan.y) / canvasZoom - (DEFAULT_PLANNING_NODE_HEIGHT / 2)
    });
  };

  const handleNodeClick = (event, node) => {
    event.stopPropagation();
    if (connectionSource === 'armed') {
      setConnectionSource(node.id);
      setSelectedId(node.id);
    } else if (connectionSource && connectionSource !== node.id) {
      setEdges((current) => current.some((edge) => edge.source === connectionSource && edge.target === node.id) ? current : [...current, { id: `${connectionSource}-${node.id}`, source: connectionSource, target: node.id }]);
      setConnectionSource(null);
    } else if (connectionSource === node.id) {
      setConnectionSource(null);
    } else {
      setSelectedId(node.id);
    }
  };

  const beginDrag = (event, node) => {
    if (connectionSource || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    nodeInteractionRef.current = {
      type: 'drag',
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y
    };
    setDraggingId(node.id);
  };

  const beginNodeResize = (event, node) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    nodeInteractionRef.current = {
      type: 'resize',
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: node.width || DEFAULT_PLANNING_NODE_WIDTH,
      startHeight: node.height || DEFAULT_PLANNING_NODE_HEIGHT
    };
    setSelectedId(node.id);
  };

  const moveNode = (event) => {
    const interaction = nodeInteractionRef.current;
    if (!interaction || !canvasRef.current) return;
    const paletteBounds = paletteRef.current?.getBoundingClientRect();
    const overRemovalZone = interaction.type === 'drag' && Boolean(paletteBounds && event.clientX >= paletteBounds.left && event.clientX <= paletteBounds.right && event.clientY >= paletteBounds.top && event.clientY <= paletteBounds.bottom);
    setRemovalHover((current) => current === overRemovalZone ? current : overRemovalZone);
    const deltaX = (event.clientX - interaction.startClientX) / canvasZoom;
    const deltaY = (event.clientY - interaction.startClientY) / canvasZoom;
    setNodes((current) => current.map((node) => {
      if (node.id !== interaction.id) return node;
      if (interaction.type === 'resize') {
        return {
          ...node,
          width: Math.max(MIN_PLANNING_NODE_WIDTH, Math.min(PLANNING_CANVAS_SIZE - node.x - 10, interaction.startWidth + deltaX)),
          height: Math.max(MIN_PLANNING_NODE_HEIGHT, Math.min(PLANNING_CANVAS_SIZE - node.y - 10, interaction.startHeight + deltaY))
        };
      }
      const nodeWidth = node.width || DEFAULT_PLANNING_NODE_WIDTH;
      const nodeHeight = node.height || DEFAULT_PLANNING_NODE_HEIGHT;
      return {
        ...node,
        x: Math.max(10, Math.min(PLANNING_CANVAS_SIZE - nodeWidth - 10, interaction.startX + deltaX)),
        y: Math.max(10, Math.min(PLANNING_CANVAS_SIZE - nodeHeight - 10, interaction.startY + deltaY))
      };
    }));
  };

  const endNodeInteraction = (event) => {
    const interaction = nodeInteractionRef.current;
    const paletteBounds = paletteRef.current?.getBoundingClientRect();
    const droppedInPalette = interaction?.type === 'drag' && event && paletteBounds && event.clientX >= paletteBounds.left && event.clientX <= paletteBounds.right && event.clientY >= paletteBounds.top && event.clientY <= paletteBounds.bottom;
    if (droppedInPalette) {
      setNodes((current) => current.filter((node) => node.id !== interaction.id));
      setEdges((current) => current.filter((edge) => edge.source !== interaction.id && edge.target !== interaction.id));
      setSelectedId((current) => current === interaction.id ? null : current);
      setConnectionSource((current) => current === interaction.id ? null : current);
    }
    nodeInteractionRef.current = null;
    setRemovalHover(false);
    setDraggingId(null);
  };

  const beginCanvasPan = (event) => {
    if (connectionSource || event.button !== 0 || event.target.closest('[data-planning-node]')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasPanInteractionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: canvasPan.x,
      startY: canvasPan.y
    };
    canvasPanDidMoveRef.current = false;
    setIsCanvasPanning(true);
  };

  const moveCanvasPan = (event) => {
    const interaction = canvasPanInteractionRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!interaction || !rect) return;
    const minX = Math.min(0, rect.width - PLANNING_CANVAS_SIZE * canvasZoom);
    const minY = Math.min(0, rect.height - PLANNING_CANVAS_SIZE * canvasZoom);
    if (Math.abs(event.clientX - interaction.startClientX) > 2 || Math.abs(event.clientY - interaction.startClientY) > 2) canvasPanDidMoveRef.current = true;
    setCanvasPan({
      x: Math.min(0, Math.max(minX, interaction.startX + event.clientX - interaction.startClientX)),
      y: Math.min(0, Math.max(minY, interaction.startY + event.clientY - interaction.startClientY))
    });
  };

  const endCanvasPan = () => {
    if (!canvasPanInteractionRef.current) return;
    canvasPanInteractionRef.current = null;
    setIsCanvasPanning(false);
  };

  const handleCanvasClick = () => {
    if (canvasPanDidMoveRef.current) {
      canvasPanDidMoveRef.current = false;
      return;
    }
    setSelectedId(null);
    if (connectionSource === 'armed') setConnectionSource(null);
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

  return <>
    <div className={styles.planningToolbar}>
      <div><span className={styles.planningEyebrow}>Architecture workspace</span><h1>Design your AWS architecture</h1><p>Drag services onto the canvas, arrange them, then connect the flow.</p></div>
      <div className={styles.planningActions}>
        <button className={styles.secondaryBtn} type="button" onClick={createNewArchitecture}><Icon name="plus" size={15} /> New architecture</button>
        <button className={styles.secondaryBtn} type="button" onClick={() => importInputRef.current?.click()}><Icon name="upload" size={15} /> Import</button>
        <input ref={importInputRef} className={styles.hiddenFileInput} type="file" accept=".json,.graphivo.json,application/json" onChange={handleImportFile} tabIndex={-1} />
        <button className={styles.secondaryBtn} type="button" onClick={exportArchitecture}><Icon name="download" size={15} /> Export</button>
        <button className={`${styles.secondaryBtn} ${connectionSource ? styles.activeTool : ''}`} type="button" onClick={() => setConnectionSource((value) => value ? null : 'armed')}><Icon name="link" size={15} /> {connectionSource ? 'Cancel link' : 'Connect services'}</button>
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
        <div className={styles.planningCanvasTop}><div className={styles.canvasTitle}><Icon name="layers" size={15} /><input aria-label="Architecture name" title="Rename architecture" maxLength={120} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitDocumentName} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setNameDraft(planningDocument.name); event.currentTarget.blur(); } }} /><small>{feedback?.type === 'info' ? 'Saving' : lastSavedAt ? 'Saved' : 'Draft'}</small></div><div className={styles.canvasMeta}><span className={styles.canvasHint}>{connectionSource ? 'Select two services to create a connection' : 'Drop a service here to add it'}</span><span className={styles.zoomHint}>{Math.round(canvasZoom * 100)}% · Ctrl + scroll</span></div></div>
        <div className={`${styles.planningCanvas} ${isCanvasPanning ? styles.planningCanvasPanning : ''}`} ref={canvasRef} onPointerDown={beginCanvasPan} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onPointerMove={(event) => { moveCanvasPan(event); moveNode(event); }} onPointerUp={(event) => { endCanvasPan(); endNodeInteraction(event); }} onPointerCancel={(event) => { endCanvasPan(); endNodeInteraction(event); }} onClick={handleCanvasClick}>
          <div className={styles.planningCanvasSurface} style={{ '--canvas-zoom': canvasZoom, '--canvas-pan-x': `${canvasPan.x}px`, '--canvas-pan-y': `${canvasPan.y}px` }}>
          <div className={styles.canvasGrid} />
          {edges.length ? <svg className={styles.connectionLayer} aria-hidden="true">{edges.map((edge) => { const source = nodes.find((node) => node.id === edge.source); const target = nodes.find((node) => node.id === edge.target); return source && target ? <line key={edge.id} x1={source.x + (source.width || DEFAULT_PLANNING_NODE_WIDTH) / 2} y1={source.y + (source.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2} x2={target.x + (target.width || DEFAULT_PLANNING_NODE_WIDTH) / 2} y2={target.y + (target.height || DEFAULT_PLANNING_NODE_HEIGHT) / 2} /> : null; })}</svg> : null}
          {!nodes.length ? <div className={styles.planningEmpty}><span><Icon name="cursor" size={27} /></span><h2>Start with a service</h2><p>Choose an AWS service from the library and drag it here to start mapping your system.</p></div> : null}
          {nodes.map((node) => <div
            key={node.id}
            role="button"
            tabIndex={0}
            data-planning-node="true"
            aria-label={`${node.name} architecture node`}
            className={`${styles.planningNode} ${selectedId === node.id ? styles.planningNodeSelected : ''} ${connectionSource === node.id ? styles.planningNodeSource : ''} ${draggingId === node.id ? styles.planningNodeDragging : ''}`}
            style={{ left: node.x, top: node.y, width: node.width || DEFAULT_PLANNING_NODE_WIDTH, height: node.height || DEFAULT_PLANNING_NODE_HEIGHT, ...getPlanningNodeVisualStyle(node) }}
            onPointerDown={(event) => beginDrag(event, node)}
            onClick={(event) => handleNodeClick(event, node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') handleNodeClick(event, node);
            }}
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
          {connectionSource === 'armed' ? <div className={styles.connectionHelper}>Choose the first service to connect</div> : null}
          </div>
        </div>
      </section>
      <aside className={styles.planningInspector} aria-label="Architecture details">
        {selectedNode && selectedNodeService ? <><span className={styles.panelKicker}>AWS service details</span><PlanningServiceIcon service={selectedNodeService} /><h2>{selectedNode.name}</h2><p>{selectedServiceDetails?.[0] || 'AWS managed service selected for this architecture.'}</p><div className={styles.realWorldUse}><span>Common use</span><p>{selectedServiceDetails?.[1] || 'Use this service as part of your planned AWS workload.'}</p></div><dl><div><dt>Category</dt><dd>{selectedNodeService.category}</dd></div><div><dt>Connections</dt><dd>{edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</dd></div></dl></> : <div className={styles.plannerInspectorEmpty}><span><Icon name="grid" size={20} /></span><h2>Architecture details</h2><p>Select a service in the canvas to see what it does and how it is commonly used in a real AWS workload.</p></div>}
      </aside>
    </div>
  </>;
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [mode, setMode] = useState('live');
  const [profile, setProfile] = useState('default');
  const [region, setRegion] = useState('ap-southeast-2');
  const [status, setStatus] = useState('Ready. Enter profile/region and click Load Topology.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [topologyStats, setTopologyStats] = useState(null);
  const [topologyGraph, setTopologyGraph] = useState(null);
  const [resourceCounts, setResourceCounts] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [canFetchTopology, setCanFetchTopology] = useState(false);
  const cyContainerRef = useRef(null);
  const cyInstanceRef = useRef(null);

  useEffect(() => {
    setCanFetchTopology(Boolean(window.__TAURI__?.core?.invoke));
    return () => {
      if (cyInstanceRef.current) cyInstanceRef.current.destroy();
    };
  }, []);

  const destroyGraph = useCallback(() => {
    if (cyInstanceRef.current) {
      cyInstanceRef.current.destroy();
      cyInstanceRef.current = null;
    }
  }, []);

  const applyZoomedFit = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.resize();
    cy.fit(cy.elements(), 86);
    cy.center();
  }, []);

  const adjustLiveZoom = useCallback((factor) => {
    const cy = cyInstanceRef.current;
    if (!cy) return false;
    const bounds = cyContainerRef.current?.getBoundingClientRect();
    const level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    cy.zoom({ level, renderedPosition: { x: (bounds?.width || 0) / 2, y: (bounds?.height || 0) / 2 } });
    return true;
  }, []);

  const handleLiveWheel = useCallback((event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const cy = cyInstanceRef.current;
    if (!cy) return;

    const bounds = cyContainerRef.current?.getBoundingClientRect();
    const pointer = { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) };
    const currentZoom = cy.zoom();
    const level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), currentZoom * getWheelZoomFactor(event)));
    const pan = cy.pan();
    const modelPosition = { x: (pointer.x - pan.x) / currentZoom, y: (pointer.y - pan.y) / currentZoom };
    const targetPan = { x: pointer.x - modelPosition.x * level, y: pointer.y - modelPosition.y * level };

    cy.stop();
    cy.animate({ zoom: level, pan: targetPan }, { duration: 120, easing: 'ease-out' });
  }, []);

  useEffect(() => {
    if (mode !== 'live') return undefined;
    const canvas = cyContainerRef.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', handleLiveWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleLiveWheel);
  }, [handleLiveWheel, mode]);

  const renderGraph = useCallback(async (graph, attempt = 0) => {
    if (!cyContainerRef.current) throw new Error('Graph container not available');
    const { clientWidth: width, clientHeight: height } = cyContainerRef.current;
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
        { selector: 'node', style: { shape: 'round-rectangle', width: 'data(nodeWidth)', height: 'data(nodeHeight)', 'background-color': '#ffffff', 'background-image': 'data(icon)', 'background-fit': 'none', 'background-width': 34, 'background-height': 34, 'background-position-x': '50%', 'background-position-y': '25%', 'background-repeat': 'no-repeat', 'background-image-opacity': 1, 'background-opacity': 1, label: 'data(displayLabel)', color: '#162033', 'font-size': 9.5, 'font-weight': 600, 'line-height': 1.5, 'text-wrap': 'wrap', 'text-max-width': 'data(textMaxWidth)', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': -38, 'text-justification': 'center', 'border-width': 1.2, 'border-color': '#b9c7d8', 'overlay-opacity': 0, padding: 0, 'shadow-color': '#6d7d91', 'shadow-blur': 5, 'shadow-opacity': 0.12, 'shadow-offset-x': 0, 'shadow-offset-y': 3, 'transition-property': 'border-color, border-width, shadow-blur, shadow-opacity', 'transition-duration': '180ms' } },
        { selector: 'node.hovered', style: { 'border-color': '#2563eb', 'border-width': 2.4, 'shadow-color': '#60a5fa', 'shadow-blur': 15, 'shadow-opacity': 0.35 } },
        { selector: 'node[compact = "yes"]', style: { 'text-valign': 'center', 'text-margin-y': 0, 'background-color': '#f8fafc', 'border-color': '#cbd5e1' } },
        { selector: 'node.connected-node', style: { 'border-color': '#4f83cc', 'shadow-opacity': 0.27 } },
        { selector: 'node:selected', style: { 'border-color': '#2563eb', 'border-width': 2.6, 'shadow-color': '#60a5fa', 'shadow-blur': 16, 'shadow-opacity': 0.42 } },
        { selector: 'edge', style: { width: 1.7, 'line-color': '#8ca3bd', 'target-arrow-color': '#8ca3bd', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.05, 'curve-style': 'bezier', 'control-point-step-size': 36, 'overlay-opacity': 0, 'transition-property': 'line-color, target-arrow-color, width', 'transition-duration': '180ms' } },
        { selector: 'edge.connected-hover, edge:selected', style: { width: 2.8, 'line-color': '#2563eb', 'target-arrow-color': '#2563eb' } }
      ],
      layout: { name: 'breadthfirst', directed: true, animate: true, animationDuration: 450, fit: true, padding: 86, spacingFactor: 0.92, avoidOverlap: true, nodeDimensionsIncludeLabels: true },
      minZoom: 0.3,
      maxZoom: 6,
      wheelSensitivity: 0.56,
      userZoomingEnabled: false
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
    cy.on('mouseover', 'edge', (event) => event.target.addClass('connected-hover'));
    cy.on('mouseout', 'edge', (event) => event.target.removeClass('connected-hover'));
    cy.on('tap', 'node', (event) => {
      const nodeData = event.target.data();
      setSelectedNode({ id: nodeData.id, label: nodeData.label, type: nodeData.type || getNodeTypeFromId(nodeData.id) });
    });
    cy.on('tap', (event) => { if (event.target === cy) setSelectedNode(null); });
    cy.one('layoutstop', applyZoomedFit);
    setTimeout(applyZoomedFit, 900);
    setTimeout(applyZoomedFit, 1700);
  }, [applyZoomedFit, destroyGraph]);

  useEffect(() => {
    if (mode !== 'live') {
      destroyGraph();
      return undefined;
    }
    if (!topologyGraph) return undefined;
    const renderTimer = window.setTimeout(() => { renderGraph(topologyGraph).catch(() => {}); }, 0);
    return () => window.clearTimeout(renderTimer);
  }, [destroyGraph, mode, renderGraph, topologyGraph]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (mode !== 'live' || (!event.ctrlKey && !event.metaKey)) return;
      const zoomIn = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract';
      if (zoomIn && adjustLiveZoom(1.18)) event.preventDefault();
      if (zoomOut && adjustLiveZoom(1 / 1.18)) event.preventDefault();
      if (event.key === '0' && cyInstanceRef.current) {
        event.preventDefault();
        applyZoomedFit();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [adjustLiveZoom, applyZoomedFit, mode]);

  const fetchTopology = useCallback(async (isRefresh) => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) {
      setError('The Tauri backend is unavailable. Start Graphivo with `npm run dev`.');
      return;
    }
    setError('');
    setLoading(true);
    setSelectedNode(null);
    setStatus(isRefresh ? 'Refreshing topology from AWS...' : 'Loading topology from AWS...');
    try {
      const graph = await invoke('fetch_topology', { profile, region });
      await renderGraph(graph);
      setTopologyGraph(graph);
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      const edges = Array.isArray(graph?.edges) ? graph.edges.length : 0;
      const counts = (Array.isArray(graph?.nodes) ? graph.nodes : []).reduce((result, node) => {
        const type = node?.data?.type || getNodeTypeFromId(node?.data?.id);
        if (type) result[type] = (result[type] || 0) + 1;
        return result;
      }, {});
      setTopologyStats({ nodes, edges });
      setResourceCounts(counts);
      setStatus(`Topology loaded successfully: ${nodes} nodes, ${edges} connections.`);
    } catch (err) {
      const message = err?.message || String(err);
      setError(`Failed to load topology: ${message}`);
      setStatus('Failed to load topology. Review error details above.');
    } finally {
      setLoading(false);
    }
  }, [profile, region, renderGraph]);

  const selectedService = selectedNode ? SERVICE_MAP[selectedNode.type] || { heading: 'AWS Resource', fallbackColor: '#6b8fca' } : null;
  const activeLegendItems = Object.keys(SERVICE_MAP).filter((type) => resourceCounts[type] > 0);

  if (showLanding) return <Landing onComplete={() => setShowLanding(false)} />;

  return <main className={styles.appShell}>
    <section className={styles.mainView}>
      <header className={styles.topbar}>
        <div className={styles.brandLockup}><span className={styles.brandMark}><Icon name="network" size={17} /></span><div><span className={styles.brandName}>Graphivo</span><span className={styles.brandCaption}>AWS topology explorer</span></div></div>
        <nav className={styles.modeSwitch} aria-label="Workspace mode"><button type="button" className={mode === 'live' ? styles.modeActive : ''} onClick={() => setMode('live')}><i />Live mode</button><button type="button" className={mode === 'planning' ? styles.modeActive : ''} onClick={() => setMode('planning')}><Icon name="grid" size={14} />Planning mode</button></nav>
        <div className={styles.topbarMeta}><span className={`${styles.connectionState} ${canFetchTopology ? styles.connectionReady : styles.connectionOffline}`}><i /> {canFetchTopology ? 'Native backend ready' : 'Tauri backend unavailable'}</span></div>
      </header>
      {mode === 'planning' ? <PlanningWorkspace /> : <>
      <div className={styles.toolbarCard}>
        <div className={styles.sourceLabel}><Icon name="database" size={15} /><span>Data source</span></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-profile">AWS profile</label><input id="aws-profile" value={profile} onChange={(event) => setProfile(event.target.value)} disabled={loading} autoComplete="off" /></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-region">Region</label><input id="aws-region" value={region} onChange={(event) => setRegion(event.target.value)} disabled={loading} autoComplete="off" /></div>
        <div className={styles.actionsGroup}>
          <button className={styles.secondaryBtn} disabled={loading || !topologyStats} onClick={() => fetchTopology(true)}><Icon name="refresh" size={15} /> Refresh</button>
          <button className={styles.primaryBtn} disabled={loading} onClick={() => fetchTopology(false)}>{loading ? <><span className={styles.buttonSpinner} /> Loading</> : <><Icon name="network" size={15} /> Load topology</>}</button>
        </div>
      </div>
      {error ? <div className={styles.errorBanner} role="alert"><Icon name="info" size={17} /><div><strong>Could not load topology</strong><p>{error.replace('Failed to load topology: ', '')}</p></div></div> : null}
      <div className={styles.workspaceMeta}><div><strong>Topology</strong><span>{topologyStats ? `${topologyStats.nodes} resources · ${topologyStats.edges} connections` : 'No topology loaded'}</span></div><div className={styles.status} role="status"><span className={`${styles.statusDot} ${loading ? styles.statusDotLoading : ''}`} />{status}</div></div>
      <div className={styles.workspace}>
        <section className={styles.graphPanel} aria-label="AWS topology graph">
          <div className={styles.canvasTools}><div className={styles.legend} aria-label="Resource legend">{activeLegendItems.map((type) => <span key={type}><i className={styles[`legend${type.charAt(0).toUpperCase()}${type.slice(1)}`]} />{SERVICE_MAP[type].heading}</span>)}</div><button className={styles.iconButton} type="button" onClick={applyZoomedFit} aria-label="Fit topology to view" title="Fit topology to view"><Icon name="fit" size={16} /></button></div>
          {!topologyStats && !loading ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="cloud" size={26} /></span><h1>Map your AWS infrastructure</h1><p>Choose a local AWS profile and region, then load the live resource relationships.</p><button className={styles.primaryBtn} type="button" onClick={() => fetchTopology(false)}><Icon name="network" size={15} /> Load topology</button></div> : null}
          {loading ? <div className={styles.loadingOverlay}><span className={styles.loadingPulse} /> Syncing resources from AWS</div> : null}
          <div ref={cyContainerRef} className={styles.cy} />
        </section>
        <aside className={styles.inspector} aria-label="Resource details">
          {selectedNode ? <><div className={styles.inspectorHeader}><div className={styles.resourceType}><i style={{ backgroundColor: selectedService.fallbackColor }} />{selectedService.heading}</div><button className={styles.closeButton} type="button" onClick={() => setSelectedNode(null)} aria-label="Close resource details"><Icon name="close" size={15} /></button></div><h2>{selectedNode.label || getResourceId(selectedNode.id)}</h2><dl className={styles.detailsList}><div><dt>Resource ID</dt><dd>{getResourceId(selectedNode.id)}</dd></div><div><dt>Resource type</dt><dd>{selectedService.heading}</dd></div><div><dt>Region</dt><dd>{region}</dd></div><div><dt>Profile</dt><dd>{profile || 'default'}</dd></div></dl></> : <div className={styles.inspectorEmpty}><span><Icon name="info" size={20} /></span><h2>Resource details</h2><p>Select a node in the topology to inspect its identity and placement.</p></div>}
        </aside>
      </div>
      </>}
    </section>
  </main>;
}
