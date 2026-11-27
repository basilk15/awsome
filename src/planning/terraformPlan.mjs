import { MAX_PLANNING_EDGES, MAX_PLANNING_NODES } from '../planningDocument.mjs';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, PLANNING_CANVAS_SIZE, layoutPlanningNodes } from './liveTopology.mjs';

const PROVENANCE = 'imported-from-terraform';
const AWS_PROVIDER = 'registry.terraform.io/hashicorp/aws';
const AWS_SERVICES = {
  aws_vpc: 'vpc',
  aws_subnet: 'subnet',
  aws_internet_gateway: 'igw',
  aws_nat_gateway: 'nat',
  aws_egress_only_internet_gateway: 'egress_only_igw',
  aws_route_table: 'route_table',
  aws_vpc_endpoint: 'vpc_endpoint',
  aws_vpc_peering_connection: 'vpc_peering',
  aws_security_group: 'sg',
  aws_ec2_transit_gateway: 'transit',
  aws_ec2_transit_gateway_vpc_attachment: 'transit_gateway_attachment',
  aws_ec2_transit_gateway_route_table: 'transit_gateway_route_table',
  aws_instance: 'ec2',
  aws_lambda_function: 'lambda',
  aws_ecs_cluster: 'ecs',
  aws_ecs_service: 'ecs',
  aws_eks_cluster: 'eks',
  aws_db_instance: 'rds',
  aws_s3_bucket: 's3',
  aws_dynamodb_table: 'dynamodb',
  aws_ebs_volume: 'ebs',
  aws_efs_file_system: 'efs',
  aws_sqs_queue: 'sqs',
  aws_sns_topic: 'sns',
  aws_lb_listener: 'listener',
  aws_lb_listener_rule: 'listener_rule',
  aws_lb_target_group: 'target_group'
};

const LOAD_BALANCERS = ['alb', 'nlb', 'elb'];
const VPC_CHILDREN = ['subnet', 'igw', 'egress_only_igw', 'route_table', 'vpc_endpoint', 'sg', 'target_group', 'transit_gateway_attachment', ...LOAD_BALANCERS];
const RELATIONSHIPS = [
  { subjects: VPC_CHILDREN, field: 'vpc_id', targets: ['vpc'], label: 'Contains', parent: true },
  { subjects: ['vpc_peering'], field: 'vpc_id', targets: ['vpc'], label: 'Requests peering', parent: true },
  { subjects: ['vpc_peering'], field: 'peer_vpc_id', targets: ['vpc'], label: 'Peers with' },
  { subjects: ['ec2', 'nat'], field: 'subnet_id', targets: ['subnet'], label: 'Hosts', parent: true },
  { subjects: ['vpc_endpoint', 'transit_gateway_attachment'], field: 'subnet_ids', targets: ['subnet'], label: 'Hosts', parent: true, multiple: true },
  { subjects: LOAD_BALANCERS, field: 'subnets', targets: ['subnet'], label: 'Hosts', parent: true, multiple: true },
  { subjects: ['ec2', 'rds', 'aurora'], field: 'vpc_security_group_ids', targets: ['sg'], label: 'Uses security group', multiple: true },
  { subjects: ['vpc_endpoint'], field: 'security_group_ids', targets: ['sg'], label: 'Uses security group', multiple: true },
  { subjects: LOAD_BALANCERS, field: 'security_groups', targets: ['sg'], label: 'Uses security group', multiple: true },
  { subjects: ['vpc_endpoint'], field: 'route_table_ids', targets: ['route_table'], label: 'Uses route table', multiple: true },
  { subjects: ['transit_gateway_attachment', 'transit_gateway_route_table'], field: 'transit_gateway_id', targets: ['transit'], label: 'Contains', parent: true },
  { subjects: ['listener'], field: 'load_balancer_arn', targets: LOAD_BALANCERS, label: 'Has listener', parent: true },
  { subjects: ['listener_rule'], field: 'listener_arn', targets: ['listener'], label: 'Has rule', parent: true }
];

const ROUTE_TARGETS = [
  ['gateway_id', ['igw']],
  ['nat_gateway_id', ['nat']],
  ['egress_only_gateway_id', ['egress_only_igw']],
  ['transit_gateway_id', ['transit']],
  ['vpc_peering_connection_id', ['vpc_peering']],
  ['vpc_endpoint_id', ['vpc_endpoint']],
  ['instance_id', ['ec2']]
];

const LINK_RESOURCES = new Set(['aws_route', 'aws_route_table_association', 'aws_lb_target_group_attachment']);
const LOAD_BALANCER_TYPES = new Map([['application', 'alb'], ['network', 'nlb'], ['gateway', 'elb']]);
const RESOURCE_REFERENCE = /^([^.]+\.[^.[\]]+)(\[(?:\d+|"(?:[^"\\]|\\.)*")\])?(?:\.|$)/;

class TerraformGraphCapacityError extends Error {}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = value => Array.isArray(value) ? value : [];
const isManagedAws = resource => resource?.mode === 'managed' && [AWS_PROVIDER, 'aws'].includes(resource.provider_name);

function collectChanges(resourceChanges) {
  const groups = { delete: [], replace: [], update: [], create: [] };
  for (const entry of array(resourceChanges)) {
    if (!isManagedAws(entry) || typeof entry.address !== 'string' || !entry.address.trim()) continue;
    const actions = array(entry.change?.actions);
    const [first, second] = actions;
    if (actions.length === 2 && ((first === 'delete' && second === 'create')
      || (first === 'create' && second === 'delete'))) {
      groups.replace.push(entry.address);
    } else if (actions.length === 1 && (first === 'delete' || first === 'update' || first === 'create')) {
      groups[first].push(entry.address);
    }
  }
  for (const addresses of Object.values(groups)) addresses.sort((left, right) => left.localeCompare(right));
  return groups;
}

function expressionReferences(expression) {
  return isObject(expression) && !Object.hasOwn(expression, 'constant_value') ? array(expression.references) : [];
}

function isSensitive({ resource }, name) {
  if (resource.sensitive_values === true) return true;
  const pending = [resource.sensitive_values?.[name]];
  while (pending.length) {
    const mask = pending.pop();
    if (mask === true) return true;
    if (mask && typeof mask === 'object') {
      for (const child of Object.values(mask)) pending.push(child);
    }
  }
  return false;
}

function attribute(entry, name) {
  return isSensitive(entry, name) ? undefined : entry.resource.values?.[name];
}

function serviceKey(entry) {
  if (entry.type === 'aws_lb') return LOAD_BALANCER_TYPES.get(attribute(entry, 'load_balancer_type')) || 'elb';
  if (entry.type === 'aws_rds_cluster') {
    const engine = attribute(entry, 'engine');
    return typeof engine === 'string' && engine.startsWith('aurora') ? 'aurora' : 'rds';
  }
  return Object.hasOwn(AWS_SERVICES, entry.type) ? AWS_SERVICES[entry.type] : null;
}

function collectEntries(root, configuration) {
  const entries = new Map();
  const pending = [{ module: root, address: '', configuration }];
  while (pending.length) {
    const { module, address, configuration } = pending.pop();
    const prefix = address ? address + '.' : '';
    const expressions = new Map(array(configuration?.resources).map(resource => [resource?.address, resource?.expressions]));
    for (const resource of array(module.resources)) {
      if (!isManagedAws(resource)) continue;
      const { address: resourceAddress, name } = resource;
      if (typeof resourceAddress !== 'string' || !resourceAddress.startsWith(prefix)
        || typeof resource.type !== 'string' || typeof name !== 'string' || !name.trim()) {
        throw new Error('A managed AWS resource has an invalid Terraform address.');
      }
      const base = resource.type + '.' + name;
      const relativeAddress = resourceAddress.slice(prefix.length);
      if (relativeAddress !== base && !relativeAddress.startsWith(base + '[')) {
        throw new Error('A managed AWS resource has an invalid Terraform address.');
      }
      if (entries.has(resourceAddress)) throw new Error('The Terraform plan repeats an AWS resource address.');
      const type = resource.type.replace(/^aws_alb(?=_|$)/, 'aws_lb');
      entries.set(resourceAddress, {
        resource, address: resourceAddress, prefix, base, type, expressions: expressions.get(base)
      });
    }
    for (const child of array(module.child_modules)) {
      if (typeof child?.address !== 'string' || !child.address.startsWith(prefix + 'module.')) {
        throw new Error('A Terraform child module has an invalid address.');
      }
      const call = child.address.slice(prefix.length + 'module.'.length).split('[', 1)[0];
      pending.push({ module: child, address: child.address, configuration: configuration?.module_calls?.[call]?.module });
    }
  }
  return [...entries.values()].sort((left, right) => left.address.localeCompare(right.address));
}

function indexValue(index, value, entry) {
  if (typeof value !== 'string' || !value) return;
  if (!index.has(value)) index.set(value, new Set());
  index.get(value).add(entry);
}

function referenceEntries(prefix, references, byAddress, byBlock) {
  const result = new Set();
  const indexedBlocks = new Set();
  const unindexedBlocks = new Set();
  for (const reference of array(references)) {
    if (typeof reference !== 'string') continue;
    const match = RESOURCE_REFERENCE.exec(reference);
    if (!match) continue;
    const block = prefix + match[1];
    if (match[2]) {
      indexedBlocks.add(block);
      const entry = byAddress.get(block + match[2]);
      if (entry) result.add(entry);
    } else {
      unindexedBlocks.add(block);
    }
  }
  // The JSON format emits the block prefix alongside an explicit indexed reference.
  for (const block of unindexedBlocks) {
    const candidates = byBlock.get(block);
    if (candidates?.size === 1 && !indexedBlocks.has(block)) result.add(candidates.values().next().value);
  }
  return [...result];
}

function layoutTerraformResources(nodes, edges) {
  const placed = layoutPlanningNodes(nodes, edges);
  const overlaps = placed.some((node, index) => {
    for (let previous = 0; previous < index; previous += 1) {
      const other = placed[previous];
      if (Math.abs(node.x - other.x) < node.width && Math.abs(node.y - other.y) < node.height) return true;
    }
    return false;
  });
  if (!overlaps) return placed;

  const margin = 50;
  const gap = 24;
  const usableSize = PLANNING_CANVAS_SIZE - margin * 2;
  const columnStep = DEFAULT_NODE_WIDTH + gap;
  const columns = Math.min(Math.ceil(Math.sqrt(nodes.length)), Math.floor(usableSize / columnStep));
  const rows = Math.ceil(nodes.length / columns);
  const rowStep = Math.min(DEFAULT_NODE_HEIGHT + gap, (usableSize - DEFAULT_NODE_HEIGHT) / Math.max(1, rows - 1));
  return nodes.map((node, index) => ({
    ...node, x: margin + (index % columns) * columnStep, y: Math.round(margin + Math.floor(index / columns) * rowStep)
  }));
}

function buildGraph(entries) {
  const byAddress = new Map();
  const byBlock = new Map();
  const byIdentity = new Map();
  const nodes = [];
  const edges = [];
  for (const entry of entries) {
    if (!entry.key) continue;
    const { address, prefix, base } = entry;
    const label = address.length <= 160 ? address : address.slice(prefix.length);
    entry.node = {
      id: 'terraform-' + String(nodes.length + 1).padStart(4, '0'),
      name: label.slice(0, 160).trimEnd(),
      serviceKey: entry.key,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      provenance: PROVENANCE,
      terraformAddress: address,
      terraformResourceType: entry.resource.type
    };
    nodes.push(entry.node);
    byAddress.set(address, entry);
    indexValue(byBlock, prefix + base, entry);
    indexValue(byIdentity, attribute(entry, 'id'), entry);
    indexValue(byIdentity, attribute(entry, 'arn'), entry);
  }

  const signatures = new Set();
  function connect(source, target, label) {
    if (source.node.id === target.node.id) return;
    const signature = [source.node.id, target.node.id, label].join('\0');
    if (signatures.has(signature)) return;
    if (edges.length >= MAX_PLANNING_EDGES) {
      throw new TerraformGraphCapacityError('The Terraform plan exceeds the planner limit of ' + MAX_PLANNING_EDGES + ' relationships.');
    }
    signatures.add(signature);
    edges.push({
      id: 'terraform-link-' + (edges.length + 1), source: source.node.id, target: target.node.id,
      label, provenance: PROVENANCE
    });
  }

  function matchIdentity(value, targets) {
    const candidates = [...(byIdentity.get(value) || [])].filter(entry => targets.includes(entry.node.serviceKey));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function resolveValue(entry, known, references, targets, multiple = false) {
    if (known != null && Array.isArray(known) !== multiple) return [];
    const values = known == null ? [] : multiple ? known : [known];
    const found = new Set(values.map(value => matchIdentity(value, targets)).filter(Boolean));
    const resolved = [...found].map(candidate => ({ candidate, inferred: false }));
    if (known != null && (!multiple || !values.some(value => value == null))) return resolved;

    const candidates = referenceEntries(entry.prefix, references, byAddress, byBlock)
      .filter(entry => targets.includes(entry.node.serviceKey));
    if (!multiple && candidates.length !== 1) return resolved;
    return resolved.concat(candidates.filter(candidate => !found.has(candidate))
      .map(candidate => ({ candidate, inferred: true })));
  }

  function resolve(entry, field, targets, multiple) {
    if (isSensitive(entry, field)) return [];
    return resolveValue(entry, entry.resource.values?.[field], expressionReferences(entry.expressions?.[field]), targets, multiple);
  }

  function link(entry, from, to, label) {
    const [source] = resolve(entry, ...from);
    const [target] = resolve(entry, ...to);
    if (source && target) {
      const relationship = source.inferred || target.inferred ? 'Terraform reference · ' + entry.type : label;
      connect(source.candidate, target.candidate, relationship);
    }
  }

  function connectForwardActions(entry, field) {
    const actions = array(attribute(entry, field));
    const configuredActions = array(entry.expressions?.[field]).filter(action => action?.type?.constant_value === 'forward');
    const config = configuredActions.length === 1 ? configuredActions[0] : null;
    const connectGroups = (arns, references, multiple) => {
      for (const { candidate, inferred } of resolveValue(entry, arns, references, ['target_group'], multiple)) {
        connect(entry, candidate, inferred ? 'Terraform reference · target group' : 'Forwards to');
      }
    };
    for (const action of actions) {
      if (action?.type !== 'forward') continue;
      connectGroups(action.target_group_arn, expressionReferences(config?.target_group_arn), false);
      // The weighted target groups are a set, and Terraform can reorder them after evaluation.
      const arns = array(action.forward?.[0]?.target_group).map(group => group?.arn);
      const references = array(config?.forward?.[0]?.target_group).flatMap(group => expressionReferences(group?.arn));
      connectGroups(arns, references, true);
    }
  }

  function connectSubnetMappings(entry) {
    if (isSensitive(entry, 'subnet_mapping')) return;
    const mappings = entry.resource.values?.subnet_mapping;
    const ids = Array.isArray(mappings) ? mappings.map(mapping => mapping?.subnet_id) : mappings;
    const references = array(entry.expressions?.subnet_mapping).flatMap(mapping => expressionReferences(mapping?.subnet_id));
    for (const { candidate, inferred } of resolveValue(entry, ids, references, ['subnet'], true)) {
      if (inferred) connect(entry, candidate, 'Terraform reference · subnet_mapping');
      else connect(candidate, entry, 'Hosts');
    }
  }

  for (const entry of entries) {
    const key = entry.node?.serviceKey;
    if (key) {
      for (const { subjects, field, targets, label, parent, multiple } of RELATIONSHIPS) {
        if (!subjects.includes(key)) continue;
        for (const { candidate, inferred } of resolve(entry, field, targets, multiple)) {
          if (inferred) connect(entry, candidate, 'Terraform reference · ' + field);
          else connect(parent ? candidate : entry, parent ? entry : candidate, label);
        }
      }
      if (key === 'listener' || key === 'listener_rule') {
        connectForwardActions(entry, key === 'listener' ? 'default_action' : 'action');
      }
      if (LOAD_BALANCERS.includes(key)) connectSubnetMappings(entry);
    } else if (entry.type === 'aws_route') {
      for (const destination of ROUTE_TARGETS) {
        link(entry, ['route_table_id', ['route_table']], destination, 'Routes to');
      }
    } else if (entry.type === 'aws_route_table_association') {
      link(entry, ['subnet_id', ['subnet']], ['route_table_id', ['route_table']], 'Uses route table');
      link(entry, ['gateway_id', ['igw']], ['route_table_id', ['route_table']], 'Uses route table');
    } else if (entry.type === 'aws_lb_target_group_attachment') {
      link(entry, ['target_group_arn', ['target_group']], ['target_id', ['ec2', 'lambda', ...LOAD_BALANCERS]], 'Registers target');
    }
  }

  return { nodes: layoutTerraformResources(nodes, edges), edges };
}

function planName(fileName, timestamp) {
  const baseName = fileName.split(/[\\/]/).at(-1).replace(/(?:\.tfplan)?\.json$/i, '').trim();
  const name = baseName ? 'Terraform · ' + baseName : 'Terraform plan';
  const date = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  const suffix = Number.isFinite(date) ? ' · ' + new Date(date).toLocaleString() : '';
  return name.slice(0, 120 - suffix.length).trimEnd() + suffix;
}

export function readTerraformPlan(text, fileName = '') {
  let plan;
  try {
    plan = JSON.parse(typeof text === 'string' ? text.replace(/^\ufeff/, '') : text);
  } catch {
    return null;
  }
  if (!isObject(plan) || plan.schema || !['terraform_version', 'planned_values', 'resource_changes'].some(key => Object.hasOwn(plan, key))) return null;
  if (typeof plan.format_version !== 'string' || !/^1\.\d+$/.test(plan.format_version)) {
    throw new Error('Unsupported Terraform plan JSON format version. Use Terraform plan JSON format 1.x.');
  }
  if (plan.errored === true) throw new Error('Terraform planning failed. Generate a successful saved plan and export it again.');
  if (!isObject(plan.planned_values)) {
    throw new Error('Choose a saved Terraform plan exported with terraform show -json.');
  }
  const root = plan.planned_values.root_module;
  const entries = isObject(root) ? collectEntries(root, plan.configuration?.root_module) : [];
  let services = 0;
  let skippedResources = 0;
  for (const entry of entries) {
    entry.key = serviceKey(entry);
    if (entry.key) services += 1;
    else if (!LINK_RESOURCES.has(entry.type)) skippedResources += 1;
  }
  const review = {
    changes: collectChanges(plan.resource_changes),
    name: planName(fileName, plan.timestamp),
    incomplete: plan.complete === false,
    skippedResources
  };
  try {
    if (services > MAX_PLANNING_NODES) {
      throw new TerraformGraphCapacityError('The Terraform plan exceeds the planner limit of ' + MAX_PLANNING_NODES + ' services.');
    }
    return { ...review, ...buildGraph(entries) };
  } catch (error) {
    if (!(error instanceof TerraformGraphCapacityError)) throw error;
    return { ...review, nodes: [], edges: [], architectureIssue: error.message };
  }
}

export function serializeTerraformChangeSummary({ incomplete, changes }) {
  const { delete: deletions, replace, update, create } = changes;
  return JSON.stringify({
    version: 1,
    incomplete,
    changes: { delete: deletions, replace, update, create }
  }, null, 2);
}
