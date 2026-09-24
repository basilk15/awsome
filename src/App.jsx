import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import internetGatewayIcon from 'aws-icons/icons/resource/AmazonVPCInternetGateway.svg';
import natGatewayIcon from 'aws-icons/icons/resource/AmazonVPCNATGateway.svg';
import vpcEndpointIcon from 'aws-icons/icons/resource/AmazonVPCEndpoints.svg';
import vpcPeeringIcon from 'aws-icons/icons/resource/AmazonVPCPeeringConnection.svg';
import transitGatewayAttachmentIcon from 'aws-icons/icons/resource/AWSTransitGatewayAttachment.svg';
import applicationLoadBalancerIcon from 'aws-icons/icons/resource/ElasticLoadBalancingApplicationLoadBalancer.svg';
import networkLoadBalancerIcon from 'aws-icons/icons/resource/ElasticLoadBalancingNetworkLoadBalancer.svg';
import Landing from './Landing';
import logo from '../docs/assets/awsome-logo-transparent.png';
import { canShowLiveEdgeLabel, getKeyboardZoomDirection, getLiveCanvasAutoPanDelta, getLiveEdgeDisplayLabel, getWheelZoomFactor, getZoomedCanvasViewport } from './liveCanvas.mjs';
import { filterLiveTopologyGraph } from './liveTopologyFilter.mjs';
import {
  MAX_PLANNING_CONNECTION_LABEL_LENGTH,
  updatePlanningConnectionLabel
} from './planning/connectionLabels.mjs';
import {
  createPlanningSvgArtifact,
  downloadPlanningSvgArtifact
} from './planning/canvasExport.mjs';
import {
  DEFAULT_PLANNING_ZOOM,
  MAX_PLANNING_ZOOM,
  MIN_PLANNING_ZOOM
} from './planningDocument.mjs';
import usePlanningDocument from './usePlanningDocument';
import {
  convertLiveTopologyToPlan,
  DEFAULT_NODE_HEIGHT as DEFAULT_PLANNING_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH as DEFAULT_PLANNING_NODE_WIDTH,
  mergePlanningGraphs,
  PLANNING_CANVAS_SIZE
} from './planning/liveTopology.mjs';

const SERVICE_MAP = {
  vpc: { heading: 'VPC', icon: vpcIcon, fallbackColor: '#7b3fe4' },
  subnet: { heading: 'Subnet', icon: vpcIcon, fallbackColor: '#8f67d8' },
  ec2: { heading: 'EC2 Instance', icon: ec2Icon, fallbackColor: '#ec7211' },
  rds: { heading: 'RDS Instance', icon: rdsIcon, fallbackColor: '#3b48cc' },
  sg: { heading: 'Security Group', icon: vpcIcon, fallbackColor: '#64748b' },
  igw: { heading: 'Internet Gateway', icon: internetGatewayIcon, fallbackColor: '#2f855a' },
  nat: { heading: 'NAT Gateway', icon: natGatewayIcon, fallbackColor: '#0f9f9a' },
  route_table: { heading: 'Route Table', icon: vpcIcon, fallbackColor: '#475569' },
  vpc_endpoint: { heading: 'VPC Endpoint', icon: vpcEndpointIcon, fallbackColor: '#2563eb' },
  vpc_peering: { heading: 'VPC Peering Connection', icon: vpcPeeringIcon, fallbackColor: '#0284c7' },
  egress_only_igw: { heading: 'Egress-only Internet Gateway', icon: vpcIcon, fallbackColor: '#0f766e' },
  transit_gateway: { heading: 'Transit Gateway', icon: transitIcon, fallbackColor: '#7c3aed' },
  transit_gateway_attachment: { heading: 'Transit Gateway Attachment', icon: transitGatewayAttachmentIcon, fallbackColor: '#a855f7' },
  transit_gateway_route_table: { heading: 'Transit Gateway Route Table', icon: transitIcon, fallbackColor: '#6d28d9' },
  alb: { heading: 'Application Load Balancer', icon: applicationLoadBalancerIcon, fallbackColor: '#8c4fff' },
  nlb: { heading: 'Network Load Balancer', icon: networkLoadBalancerIcon, fallbackColor: '#5b5fc7' },
  listener: { heading: 'Load Balancer Listener', icon: elbIcon, fallbackColor: '#4f46e5' },
  listener_rule: { heading: 'Listener Rule', icon: elbIcon, fallbackColor: '#6366f1' },
  target_group: { heading: 'Load Balancer Target Group', icon: elbIcon, fallbackColor: '#7c3aed' },
  target_ec2: { heading: 'Registered EC2 Target', icon: ec2Icon, fallbackColor: '#ec7211' },
  target_ip: { heading: 'Registered IP Target', icon: elbIcon, fallbackColor: '#0f766e' },
  target_lambda: { heading: 'Registered Lambda Target', icon: lambdaIcon, fallbackColor: '#ff9900' },
  target_alb: { heading: 'Registered ALB Target', icon: applicationLoadBalancerIcon, fallbackColor: '#8c4fff' }
};

const PLANNING_SERVICES = [
  ['Compute', 'Amazon EC2', 'ec2', '#ec7211'], ['Compute', 'AWS Lambda', 'lambda', '#ff9900'], ['Compute', 'Amazon ECS', 'ecs', '#d86613'], ['Compute', 'Amazon EKS', 'eks', '#326ce5'], ['Compute', 'AWS Fargate', 'fargate', '#ec7211'], ['Compute', 'Elastic Beanstalk', 'beanstalk', '#3f8624'], ['Compute', 'AWS Batch', 'batch', '#ec7211'],
  ['Storage', 'Amazon S3', 's3', '#569a31'], ['Storage', 'Amazon EBS', 'ebs', '#e7157b'], ['Storage', 'Amazon EFS', 'efs', '#8c4fff'], ['Storage', 'Amazon FSx', 'fsx', '#df3312'], ['Storage', 'Storage Gateway', 'gateway', '#569a31'],
  ['Database', 'Amazon RDS', 'rds', '#3b48cc'], ['Database', 'Amazon Aurora', 'aurora', '#3b48cc'], ['Database', 'Amazon DynamoDB', 'dynamodb', '#4053d6'], ['Database', 'Amazon ElastiCache', 'elasticache', '#c925d1'], ['Database', 'Amazon Redshift', 'redshift', '#8b3eb8'], ['Database', 'Amazon Neptune', 'neptune', '#00a1c9'],
  ['Networking', 'Amazon VPC', 'vpc', '#7b3fe4'], ['Networking', 'VPC Subnet', 'subnet', '#8f67d8'], ['Networking', 'Internet Gateway', 'igw', '#2f855a'], ['Networking', 'NAT Gateway', 'nat', '#0f9f9a'], ['Networking', 'Route Table', 'route_table', '#475569'], ['Networking', 'VPC Endpoint', 'vpc_endpoint', '#2563eb'], ['Networking', 'VPC Peering Connection', 'vpc_peering', '#0284c7'], ['Networking', 'Egress-only Internet Gateway', 'egress_only_igw', '#0f766e'], ['Networking', 'Transit Gateway Attachment', 'transit_gateway_attachment', '#a855f7'], ['Networking', 'Transit Gateway Route Table', 'transit_gateway_route_table', '#6d28d9'], ['Networking', 'Application Load Balancer', 'alb', '#8c4fff'], ['Networking', 'Network Load Balancer', 'nlb', '#5b5fc7'], ['Networking', 'Load Balancer Listener', 'listener', '#4f46e5'], ['Networking', 'Listener Rule', 'listener_rule', '#6366f1'], ['Networking', 'Load Balancer Target Group', 'target_group', '#7c3aed'], ['Networking', 'Registered IP Target', 'target_ip', '#0f766e'], ['Networking', 'Registered ALB Target', 'target_alb', '#8c4fff'], ['Networking', 'Elastic Load Balancing', 'elb', '#8c4fff'], ['Networking', 'Amazon CloudFront', 'cloudfront', '#8c4fff'], ['Networking', 'Amazon Route 53', 'route53', '#8c4fff'], ['Networking', 'Amazon API Gateway', 'api', '#8c4fff'], ['Networking', 'AWS Transit Gateway', 'transit', '#8c4fff'],
  ['Compute', 'Registered EC2 Target', 'target_ec2', '#ec7211'], ['Compute', 'Registered Lambda Target', 'target_lambda', '#ff9900'],
  ['Security', 'Security Group', 'sg', '#64748b'], ['Security', 'AWS IAM', 'iam', '#dd344c'], ['Security', 'AWS KMS', 'kms', '#dd344c'], ['Security', 'AWS WAF', 'waf', '#dd344c'], ['Security', 'AWS Secrets Manager', 'secrets', '#dd344c'], ['Security', 'Amazon Cognito', 'cognito', '#dd344c'],
  ['Integration', 'Amazon SQS', 'sqs', '#e7157b'], ['Integration', 'Amazon SNS', 'sns', '#e7157b'], ['Integration', 'Amazon EventBridge', 'eventbridge', '#e7157b'], ['Integration', 'AWS Step Functions', 'stepfunctions', '#e7157b'],
  ['Analytics', 'Amazon Athena', 'athena', '#2ca6ad'], ['Analytics', 'AWS Glue', 'glue', '#2ca6ad'], ['Analytics', 'Amazon Kinesis', 'kinesis', '#2ca6ad'], ['Analytics', 'Amazon OpenSearch', 'opensearch', '#2ca6ad'], ['Analytics', 'Amazon QuickSight', 'quicksight', '#2ca6ad'],
  ['Management', 'Amazon CloudWatch', 'cloudwatch', '#e7157b'], ['Management', 'AWS CloudFormation', 'cloudformation', '#e7157b'], ['Management', 'AWS CloudTrail', 'cloudtrail', '#e7157b'], ['Management', 'AWS Systems Manager', 'ssm', '#e7157b'],
  ['AI / ML', 'Amazon Bedrock', 'bedrock', '#01a88d'], ['AI / ML', 'Amazon SageMaker', 'sagemaker', '#01a88d'], ['AI / ML', 'Amazon Rekognition', 'rekognition', '#01a88d']
].map(([category, name, key, color]) => ({ category, name, key, color }));

const PLANNING_ICON_PATHS = {
  ec2: ec2Icon, lambda: lambdaIcon, ecs: ecsIcon, eks: eksIcon, fargate: fargateIcon, beanstalk: beanstalkIcon, batch: batchIcon,
  s3: s3Icon, ebs: ebsIcon, efs: efsIcon, fsx: fsxIcon, gateway: gatewayIcon,
  rds: rdsIcon, aurora: auroraIcon, dynamodb: dynamodbIcon, elasticache: elasticacheIcon, redshift: redshiftIcon, neptune: neptuneIcon,
  vpc: vpcIcon, subnet: vpcIcon, igw: internetGatewayIcon, nat: natGatewayIcon, route_table: vpcIcon, vpc_endpoint: vpcEndpointIcon, vpc_peering: vpcPeeringIcon, egress_only_igw: vpcIcon, transit_gateway: transitIcon, transit_gateway_attachment: transitGatewayAttachmentIcon, transit_gateway_route_table: transitIcon, alb: applicationLoadBalancerIcon, nlb: networkLoadBalancerIcon, listener: elbIcon, listener_rule: elbIcon, target_group: elbIcon, target_ec2: ec2Icon, target_ip: elbIcon, target_lambda: lambdaIcon, target_alb: applicationLoadBalancerIcon, elb: elbIcon, cloudfront: cloudfrontIcon, route53: route53Icon, api: apiIcon, transit: transitIcon,
  sg: vpcIcon, iam: iamIcon, kms: kmsIcon, waf: wafIcon, secrets: secretsIcon, cognito: cognitoIcon,
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
  subnet: ['A segmented IP range inside an Amazon VPC.', 'Place workloads in public or private network zones and availability zones.'],
  igw: ['A gateway that connects a VPC to the public internet.', 'Provide internet routing for resources in public subnets.'],
  nat: ['A managed gateway for outbound internet access from private subnets.', 'Let private workloads reach external services without accepting inbound internet traffic.'],
  route_table: ['A collection of routing rules applied to VPC subnets.', 'Direct network traffic toward gateways, appliances, and other destinations.'],
  vpc_endpoint: ['Private connectivity from a VPC to supported AWS and endpoint services.', 'Keep service traffic on the AWS network instead of traversing the public internet.'],
  vpc_peering: ['A private network connection between two VPCs.', 'Exchange routes between the requester and accepter VPCs.'],
  egress_only_igw: ['IPv6-only outbound internet connectivity for a VPC.', 'Allow outbound IPv6 traffic without permitting unsolicited inbound connections.'],
  transit_gateway: ['A regional network hub that connects VPCs and hybrid networks.', 'Centralize routing across many attached networks.'],
  transit_gateway_attachment: ['The connection from a transit gateway to a VPC or other network.', 'Carries traffic between the transit gateway and its attached resource.'],
  transit_gateway_route_table: ['Routing rules for a transit gateway.', 'Choose the attachment that receives traffic for each destination.'],
  alb: ['Layer 7 load balancing for HTTP and HTTPS applications.', 'Route application requests across healthy services using host and path rules.'],
  nlb: ['High-performance Layer 4 load balancing for TCP, UDP, and TLS.', 'Distribute low-latency network traffic across healthy targets.'],
  listener: ['An entry point on a load balancer with a protocol and port.', 'Accept connections and evaluate its routing rules.'],
  listener_rule: ['A condition and action evaluated by a load balancer listener.', 'Forward, redirect, or respond to matching traffic.'],
  target_group: ['A set of registered targets behind an Elastic Load Balancer.', 'Apply a routing and health-check policy to a workload.'],
  target_ec2: ['An EC2 instance registered with a load-balancer target group.', 'Receive traffic on the configured target port.'],
  target_ip: ['An IP address registered with a load-balancer target group.', 'Route traffic to private IP workloads such as containers or on-premises targets.'],
  target_lambda: ['A Lambda function registered with an Application Load Balancer target group.', 'Invoke serverless code from HTTP(S) requests.'],
  target_alb: ['An Application Load Balancer registered with an NLB target group.', 'Chain a Network Load Balancer to an Application Load Balancer.'],
  elb: ['Managed load balancers for distributing application traffic.', 'Route requests across healthy instances, containers, or IP targets.'],
  cloudfront: ['Global content delivery network.', 'Accelerate websites, APIs, video, and downloads at edge locations.'],
  route53: ['Scalable DNS and traffic routing service.', 'Manage domains, health checks, and failover or latency-based routing.'],
  api: ['Managed service for publishing and securing APIs.', 'Expose REST, HTTP, and WebSocket APIs to clients and partners.'],
  transit: ['Central hub for VPC and on-premises network connectivity.', 'Connect many VPCs and hybrid networks through a shared routing layer.'],
  iam: ['Identity and access management for AWS resources.', 'Control who can sign in and what people or workloads can do.'],
  sg: ['Stateful virtual firewall for AWS resources.', 'Control allowed inbound and outbound traffic for workloads and databases.'],
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
  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(0, dash) : '';
}

function getResourceId(id) {
  if (typeof id !== 'string') return '';
  const dash = id.indexOf('-');
  return dash > 0 ? id.slice(dash + 1) : id;
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
    undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h8.5a5.5 5.5 0 0 1 5.5 5.5V19" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M19 12h-8.5A5.5 5.5 0 0 0 5 17.5V19" /></>,
    trash: <><path d="M4.5 7h15M9 7V4.5h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.8v5.1M12 7.8h.01" /></>,
    moon: <><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.6 8.6 0 1 0 20.4 15.2Z" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>;
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

function PlanningWorkspace({ planning }) {
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
  const [connectionSource, setConnectionSource] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
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
  const paletteRef = useRef(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  canvasZoomRef.current = canvasZoom;
  canvasPanRef.current = canvasPan;
  const categories = ['All', ...new Set(PLANNING_SERVICES.map((service) => service.category))];
  const query = search.trim().toLowerCase();
  const availableServices = PLANNING_SERVICES.filter((service) => (selectedCategory === 'All' || service.category === selectedCategory) && (!query || service.name.toLowerCase().includes(query)));
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const selectedNodeService = selectedNode ? PLANNING_SERVICES.find((service) => service.key === selectedNode.serviceKey) : null;
  const selectedServiceDetails = selectedNode ? PLANNING_SERVICE_DETAILS[selectedNode.serviceKey] : null;
  const selectedConnections = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const libraryOptions = librarySummaries.some((summary) => summary.id === planningDocument.id)
    ? librarySummaries
    : [{
        id: planningDocument.id,
        name: planningDocument.name,
        updatedAt: planningDocument.updatedAt,
        nodeCount: nodes.length,
        edgeCount: edges.length
      }, ...librarySummaries];

  useEffect(() => {
    setNameDraft(planningDocument.name);
    setSelectedId(null);
    setConnectionSource(null);
  }, [planningDocument.id, planningDocument.name]);

  const commitDocumentName = () => {
    if (!renameDocument(nameDraft)) setNameDraft(planningDocument.name);
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

  const renameSelectedNode = (name) => {
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, name } : node));
  };

  const removeNode = useCallback((nodeId) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedId((current) => current === nodeId ? null : current);
    setConnectionSource((current) => current === nodeId ? null : current);
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
  }, [redo, removeNode, selectedId, undo]);

  return <>
    <div className={styles.planningToolbar}>
      <div><span className={styles.planningEyebrow}>Architecture workspace</span><h1>Design your AWS architecture</h1><p>Drag services onto the canvas, arrange them, then connect the flow.</p></div>
      <div className={styles.planningActions}>
        <label className={styles.documentPicker}><span>Architecture</span><select value={planningDocument.id} onChange={(event) => openArchitecture(event.target.value)} aria-label="Open a saved architecture">{libraryOptions.map((summary) => <option key={summary.id} value={summary.id}>{summary.name} · {summary.nodeCount} service{summary.nodeCount === 1 ? '' : 's'}</option>)}</select></label>
        <button className={styles.secondaryBtn} type="button" onClick={createNewArchitecture}><Icon name="plus" size={15} /> New architecture</button>
        <button className={styles.secondaryBtn} type="button" onClick={() => importInputRef.current?.click()}><Icon name="upload" size={15} /> Import</button>
        <input ref={importInputRef} className={styles.hiddenFileInput} type="file" accept=".json,.awsome.json,.graphivo.json,application/json" onChange={handleImportFile} tabIndex={-1} />
        <button className={styles.secondaryBtn} type="button" onClick={exportArchitecture}><Icon name="download" size={15} /> Export</button>
        <button className={styles.secondaryBtn} type="button" onClick={exportArchitectureSvg}><Icon name="download" size={15} /> Export SVG</button>
        <button className={styles.secondaryBtn} type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Icon name="undo" size={15} /> Undo</button>
        <button className={styles.secondaryBtn} type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={15} /> Redo</button>
        <button className={`${styles.secondaryBtn} ${connectionSource ? styles.activeTool : ''}`} type="button" onClick={() => setConnectionSource((value) => value ? null : 'armed')}><Icon name="link" size={15} /> {connectionSource ? 'Cancel link' : 'Connect services'}</button>
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
        <div className={styles.planningCanvasTop}><div className={styles.canvasTitle}><Icon name="layers" size={15} /><input aria-label="Architecture name" title="Rename architecture" maxLength={120} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitDocumentName} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setNameDraft(planningDocument.name); event.currentTarget.blur(); } }} /><small>{feedback?.type === 'info' ? 'Saving' : lastSavedAt ? 'Saved' : 'Draft'}</small></div><div className={styles.canvasMeta}><span className={styles.canvasHint}>{connectionSource ? 'Select two services to create a connection' : 'Drop a service here to add it'}</span><span className={styles.zoomHint}>{Math.round(canvasZoom * 100)}% · Scroll to zoom</span></div></div>
        <div className={`${styles.planningCanvas} ${isCanvasPanning ? styles.planningCanvasPanning : ''}`} ref={canvasRef} onPointerDown={beginCanvasPan} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onPointerMove={(event) => { moveCanvasPan(event); moveNode(event); }} onPointerUp={(event) => { endCanvasPan(); endNodeInteraction(event); }} onPointerCancel={(event) => { endCanvasPan(); endNodeInteraction(event); }} onClick={handleCanvasClick}>
          <div className={styles.planningCanvasSurface} style={{ '--canvas-zoom': canvasZoom, '--canvas-pan-x': `${canvasPan.x}px`, '--canvas-pan-y': `${canvasPan.y}px` }}>
          <div className={styles.canvasGrid} />
          {edges.length ? <svg className={styles.connectionLayer} aria-hidden="true">
            <defs><marker id="planning-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            {edges.map((edge) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
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
          </svg> : null}
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

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
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
  const [status, setStatus] = useState('Ready. Enter profile/region and click Load Topology.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [topologyStats, setTopologyStats] = useState(null);
  const [topologyGraph, setTopologyGraph] = useState(null);
  const [topologyContext, setTopologyContext] = useState(null);
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [topologyWarnings, setTopologyWarnings] = useState([]);
  const [resourceCounts, setResourceCounts] = useState({});
  const [liveSearch, setLiveSearch] = useState('');
  const [selectedLiveTypes, setSelectedLiveTypes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [pendingPlanImport, setPendingPlanImport] = useState(null);
  const [canFetchTopology, setCanFetchTopology] = useState(false);
  const planning = usePlanningDocument(PLANNING_SERVICES);
  const cyContainerRef = useRef(null);
  const cyInstanceRef = useRef(null);
  const liveDragAutoPanRef = useRef(null);
  const liveGraphFitFrameRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('awsome.theme', theme);
    } catch {
      // Theme persistence is best effort when browser storage is unavailable.
    }
  }, [theme]);

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
    setCanFetchTopology(Boolean(window.__TAURI__?.core?.invoke));
    return () => {
      stopLiveDragAutoPan();
      cancelLiveGraphFit();
      if (cyInstanceRef.current) cyInstanceRef.current.destroy();
    };
  }, [cancelLiveGraphFit, stopLiveDragAutoPan]);

  const destroyGraph = useCallback(() => {
    stopLiveDragAutoPan();
    cancelLiveGraphFit();
    setHoveredEdge(null);
    if (cyInstanceRef.current) {
      cyInstanceRef.current.destroy();
      cyInstanceRef.current = null;
    }
  }, [cancelLiveGraphFit, stopLiveDragAutoPan]);

  const applyZoomedFit = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.resize();
    const bounds = cy.elements().boundingBox({
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

  const renderGraph = useCallback(async (graph, attempt = 0) => {
    if (!cyContainerRef.current) throw new Error('Graph container not available');
    const { clientWidth: width, clientHeight: height } = cyContainerRef.current;
    if ((width === 0 || height === 0) && attempt < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return renderGraph(graph, attempt + 1);
    }
    const cytoscape = (await import('cytoscape')).default;
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
      setSelectedEdge(null);
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type || getNodeTypeFromId(nodeData.id),
        details: nodeData.details && typeof nodeData.details === 'object' ? nodeData.details : {}
      });
    });
    cy.on('tap', 'edge', (event) => {
      const edge = event.target;
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
  }, [applyZoomedFit, destroyGraph, stopLiveDragAutoPan, theme]);

  const filteredTopologyGraph = useMemo(
    () => filterLiveTopologyGraph(topologyGraph, { query: liveSearch, selectedTypes: selectedLiveTypes }),
    [liveSearch, selectedLiveTypes, topologyGraph]
  );
  const hasLiveFilters = Boolean(liveSearch.trim() || selectedLiveTypes.length);

  useEffect(() => {
    if (mode !== 'live') {
      const teardownTimer = window.setTimeout(destroyGraph, 180);
      return () => window.clearTimeout(teardownTimer);
    }
    if (!topologyGraph) return undefined;
    const renderTimer = window.setTimeout(() => { renderGraph(filteredTopologyGraph).catch(() => {}); }, 0);
    return () => window.clearTimeout(renderTimer);
  }, [destroyGraph, filteredTopologyGraph, mode, renderGraph, topologyGraph]);

  useEffect(() => {
    if (!selectedNode) return;
    const visible = filteredTopologyGraph.nodes.some((node) => node?.data?.id === selectedNode.id);
    if (!visible) setSelectedNode(null);
  }, [filteredTopologyGraph, selectedNode]);

  useEffect(() => {
    if (!selectedEdge) return;
    const visible = filteredTopologyGraph.edges.some((edge) => edge?.data?.id === selectedEdge.id);
    if (!visible) setSelectedEdge(null);
  }, [filteredTopologyGraph, selectedEdge]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (mode !== 'live') return;
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

  const fetchTopology = useCallback(async (isRefresh) => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) {
      setError('The Tauri backend is unavailable. Start awsome with `npm run dev`.');
      return;
    }
    setError('');
    setLoading(true);
    if (topologyGraph) setSnapshotStale(true);
    setSelectedNode(null);
    setSelectedEdge(null);
    setStatus(isRefresh ? 'Refreshing topology from AWS...' : 'Loading topology from AWS...');
    try {
      const graph = await invoke('fetch_topology', { profile, region });
      setTopologyGraph(graph);
      const warnings = Array.isArray(graph?.warnings)
        ? graph.warnings.filter((warning) => typeof warning === 'string' && warning.trim())
        : [];
      setTopologyWarnings(warnings);
      setTopologyContext({
        profile: profile.trim() || 'default',
        region: region.trim() || 'me-south-1',
        loadedAt: new Date().toISOString()
      });
      setSnapshotStale(false);
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      const edges = Array.isArray(graph?.edges) ? graph.edges.length : 0;
      const counts = (Array.isArray(graph?.nodes) ? graph.nodes : []).reduce((result, node) => {
        const type = node?.data?.type || getNodeTypeFromId(node?.data?.id);
        if (type) result[type] = (result[type] || 0) + 1;
        return result;
      }, {});
      setTopologyStats({ nodes, edges });
      setResourceCounts(counts);
      setStatus(warnings.length
        ? `Topology loaded with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}: ${nodes} nodes, ${edges} connections.`
        : `Topology loaded successfully: ${nodes} nodes, ${edges} connections.`);
    } catch (err) {
      const message = err?.message || String(err);
      setError(`Failed to load topology: ${message}`);
      setStatus(topologyGraph
        ? 'Failed to load topology. The previous snapshot remains visible.'
        : 'Failed to load topology. Review error details above.');
    } finally {
      setLoading(false);
    }
  }, [profile, region, topologyGraph]);

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
  const toggleLiveResourceType = (type) => {
    setSelectedLiveTypes((current) => current.includes(type)
      ? current.filter((selected) => selected !== type)
      : [...current, type]);
  };
  const clearLiveFilters = () => {
    setLiveSearch('');
    setSelectedLiveTypes([]);
  };

  if (showLanding) return <Landing onComplete={() => setShowLanding(false)} />;

  return <main className={styles.appShell} data-theme={theme}>
    <section className={styles.mainView}>
      <header className={styles.topbar}>
        <div className={styles.brandLockup}><span className={styles.brandMark}><img src={logo} alt="" aria-hidden="true" draggable="false" /></span><div><span className={styles.brandName}>awsome</span><span className={styles.brandCaption}>AWS topology explorer</span></div></div>
        <nav className={styles.modeSwitch} aria-label="Workspace mode"><button type="button" className={mode === 'live' ? styles.modeActive : ''} onClick={() => switchMode('live')}><i />Live mode</button><button type="button" className={mode === 'planning' ? styles.modeActive : ''} onClick={() => switchMode('planning')}><Icon name="grid" size={14} />Planning mode</button></nav>
        <div className={styles.topbarMeta}><button type="button" className={styles.themeToggle} aria-pressed={theme === 'dark'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /><span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button><span className={`${styles.connectionState} ${canFetchTopology ? styles.connectionReady : styles.connectionOffline}`}><i /> {canFetchTopology ? 'Native backend ready' : 'Tauri backend unavailable'}</span></div>
      </header>
      <div key={mode} className={styles.modeStage}>
      {mode === 'planning' ? <PlanningWorkspace planning={planning} /> : <>
      <div className={styles.toolbarCard}>
        <div className={styles.sourceLabel}><Icon name="database" size={15} /><span>Data source</span></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-profile">AWS profile</label><input id="aws-profile" value={profile} onChange={(event) => setProfile(event.target.value)} disabled={loading} autoComplete="off" /></div>
        <div className={styles.fieldGroup}><label htmlFor="aws-region">Region</label><input id="aws-region" value={region} onChange={(event) => setRegion(event.target.value)} disabled={loading} autoComplete="off" /></div>
        <label className={styles.liveSearchBox}><Icon name="search" size={15} /><span>Find resource</span><input value={liveSearch} onChange={(event) => setLiveSearch(event.target.value)} disabled={loading || !topologyGraph} placeholder="Name, ID, detail…" aria-label="Search live topology resources" /></label>
        <div className={styles.actionsGroup}>
          <button className={styles.secondaryBtn} disabled={loading || !topologyGraph} onClick={openTopologyInPlanning}><Icon name="grid" size={15} /> Open in planning</button>
          <button className={styles.secondaryBtn} disabled={loading || !topologyStats} onClick={() => fetchTopology(true)}><Icon name="refresh" size={15} /> Refresh</button>
          <button className={styles.primaryBtn} disabled={loading} onClick={() => fetchTopology(false)}>{loading ? <><span className={styles.buttonSpinner} /> Loading</> : <><Icon name="network" size={15} /> Load topology</>}</button>
        </div>
      </div>
      {error ? <div className={styles.errorBanner} role="alert"><Icon name="info" size={17} /><div><strong>Could not load topology</strong><p>{error.replace('Failed to load topology: ', '')}</p></div></div> : null}
      {snapshotStale && !loading && topologyContext ? <div className={styles.warningBanner} role="status"><Icon name="info" size={17} /><div><strong>Showing a previous snapshot</strong><p>The latest load failed. This graph still shows {topologyContext.profile} in {topologyContext.region} from {new Date(topologyContext.loadedAt).toLocaleString()}.</p></div></div> : null}
      {topologyWarnings.length ? <section className={styles.warningBanner} role="status" aria-live="polite" aria-label="Incomplete AWS inventory warnings"><Icon name="info" size={17} /><div><strong>{snapshotStale ? 'Previous snapshot had incomplete inventory' : 'Topology loaded with incomplete inventory'}</strong><p>Some AWS resources could not be read. The displayed topology includes all successfully discovered resources.</p><ul>{topologyWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></section> : null}
      <div className={styles.workspaceMeta}><div><strong>{snapshotStale && !loading ? 'Previous snapshot' : 'Topology'}</strong><span>{topologyStats ? hasLiveFilters ? `${visibleTopologyStats.nodes} of ${topologyStats.nodes} resources · ${visibleTopologyStats.edges} of ${topologyStats.edges} connections shown` : `${topologyStats.nodes} resources · ${topologyStats.edges} connections` : 'No topology loaded'}{topologyContext ? ` · ${topologyContext.profile} / ${topologyContext.region} · loaded ${new Date(topologyContext.loadedAt).toLocaleString()}` : ''}</span></div><div className={styles.status} role="status"><span className={`${styles.statusDot} ${loading ? styles.statusDotLoading : ''}`} />{status}</div></div>
      <div className={styles.workspace}>
        <section className={styles.graphPanel} aria-label="AWS topology graph">
          <div className={styles.canvasTools}><div className={styles.legend} aria-label="Filter topology by resource type">{activeLegendItems.map((type) => <button key={type} type="button" className={selectedLiveTypes.length && !selectedLiveTypes.includes(type) ? styles.legendFilterInactive : ''} aria-pressed={!selectedLiveTypes.length || selectedLiveTypes.includes(type)} onClick={() => toggleLiveResourceType(type)} title={`Show only ${SERVICE_MAP[type].heading} resources`}><i style={{ backgroundColor: SERVICE_MAP[type].fallbackColor }} />{SERVICE_MAP[type].heading}</button>)}</div><button className={styles.iconButton} type="button" onClick={applyZoomedFit} aria-label="Fit topology to view" title="Fit topology to view"><Icon name="fit" size={16} /></button></div>
          {!topologyStats && !loading ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="cloud" size={26} /></span><h1>Map your AWS infrastructure</h1><p>Choose a local AWS profile and region, then load the live resource relationships.</p><button className={styles.primaryBtn} type="button" onClick={() => fetchTopology(false)}><Icon name="network" size={15} /> Load topology</button></div> : null}
          {topologyStats && !loading && !filteredTopologyGraph.nodes.length ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="search" size={26} /></span><h1>{hasLiveFilters ? 'No matching resources' : 'No resources found'}</h1><p>{hasLiveFilters ? 'Adjust the search or resource-type filters to see more of this topology.' : 'The selected region has no discovered resources in the supported inventory.'}</p>{hasLiveFilters ? <button className={styles.secondaryBtn} type="button" onClick={clearLiveFilters}>Clear filters</button> : null}</div> : null}
          {loading ? <div className={styles.loadingOverlay}><span className={styles.loadingPulse} /> Syncing resources from AWS</div> : null}
          <div
            ref={cyContainerRef}
            className={`${styles.cy} ${topologyGraph ? styles.cyInteractive : ''}`}
            title={topologyGraph ? 'Drag empty canvas space to move around the topology' : undefined}
          />
          {hoveredEdge ? <div className={styles.edgeHint}><strong>Relationship</strong><span>{hoveredEdge.label}</span></div> : null}
        </section>
        <aside className={styles.inspector} aria-label="Topology details">
          {selectedNode ? <><div className={styles.inspectorHeader}><div className={styles.resourceType}><i style={{ backgroundColor: selectedService.fallbackColor }} />{selectedService.heading}</div><button className={styles.closeButton} type="button" onClick={() => setSelectedNode(null)} aria-label="Close resource details"><Icon name="close" size={15} /></button></div><h2>{selectedNode.label || getResourceId(selectedNode.id)}</h2><dl className={styles.detailsList}><div><dt>Resource ID</dt><dd>{getResourceId(selectedNode.id)}</dd></div><div><dt>Resource type</dt><dd>{selectedService.heading}</dd></div>{Object.entries(selectedNode.details || {}).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatDetailValue(value)}</dd></div>)}<div><dt>Region</dt><dd>{topologyContext?.region || 'unknown'}</dd></div><div><dt>Profile</dt><dd>{topologyContext?.profile || 'unknown'}</dd></div></dl></> : selectedEdge ? <><div className={styles.inspectorHeader}><div className={styles.resourceType}><i style={{ backgroundColor: '#4f83cc' }} />Relationship</div><button className={styles.closeButton} type="button" onClick={() => setSelectedEdge(null)} aria-label="Close relationship details"><Icon name="close" size={15} /></button></div><h2>{selectedEdge.label}</h2><dl className={styles.detailsList}><div><dt>From</dt><dd>{selectedEdge.source}</dd></div><div><dt>To</dt><dd>{selectedEdge.target}</dd></div></dl></> : <div className={styles.inspectorEmpty}><span><Icon name="info" size={20} /></span><h2>Topology details</h2><p>Select a node or connection to inspect its full details.</p></div>}
        </aside>
      </div>
      </>}
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
