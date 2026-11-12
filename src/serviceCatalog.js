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

export const SERVICE_MAP = {
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

export const PLANNING_SERVICES = [
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

export const PLANNING_ICON_PATHS = {
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

export const PLANNING_SERVICE_DETAILS = {
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
