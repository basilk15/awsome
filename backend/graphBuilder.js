function getNameTag(tags) {
  if (!Array.isArray(tags)) {
    return '';
  }

  const nameTag = tags.find((tag) => tag && tag.Key === 'Name' && typeof tag.Value === 'string');
  return nameTag ? nameTag.Value : '';
}

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function buildGraph(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const vpcs = Array.isArray(input.vpcs) ? input.vpcs : [];
  const subnets = Array.isArray(input.subnets) ? input.subnets : [];
  const instances = Array.isArray(input.instances) ? input.instances : [];
  const securityGroups = Array.isArray(input.securityGroups) ? input.securityGroups : [];
  const rdsInstances = Array.isArray(input.rdsInstances) ? input.rdsInstances : [];

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeIds = new Set();

  function addNode(id, label, type) {
    if (!id || nodeIds.has(id)) {
      return;
    }

    nodeIds.add(id);
    nodes.push({
      data: {
        id,
        label,
        type
      }
    });
  }

  function addEdge(id, source, target, label) {
    if (!id || !source || !target || edgeIds.has(id)) {
      return;
    }

    edgeIds.add(id);
    edges.push({
      data: {
        id,
        source,
        target,
        label: label || ''
      }
    });
  }

  for (const vpc of vpcs) {
    const vpcId = safeString(vpc.VpcId);
    if (!vpcId) {
      continue;
    }

    const vpcNodeId = `vpc-${vpcId}`;
    const label = getNameTag(vpc.Tags) || vpcId;
    addNode(vpcNodeId, label, 'vpc');
  }

  for (const subnet of subnets) {
    const subnetId = safeString(subnet.SubnetId);
    if (!subnetId) {
      continue;
    }

    const subnetNodeId = `subnet-${subnetId}`;
    const label = getNameTag(subnet.Tags) || subnetId;
    addNode(subnetNodeId, label, 'subnet');

    const vpcId = safeString(subnet.VpcId);
    if (vpcId) {
      addEdge(
        `edge-vpc-subnet-${vpcId}-${subnetId}`,
        `vpc-${vpcId}`,
        subnetNodeId,
        'contains'
      );
    }
  }

  for (const instance of instances) {
    const instanceId = safeString(instance.InstanceId);
    if (!instanceId) {
      continue;
    }

    const instanceNodeId = `ec2-${instanceId}`;
    const label = getNameTag(instance.Tags) || instanceId;
    addNode(instanceNodeId, label, 'ec2');

    const subnetId = safeString(instance.SubnetId);
    if (subnetId) {
      addEdge(
        `edge-subnet-ec2-${subnetId}-${instanceId}`,
        `subnet-${subnetId}`,
        instanceNodeId,
        'hosts'
      );
    }

    const attachedSecurityGroups = Array.isArray(instance.SecurityGroups)
      ? instance.SecurityGroups
      : [];

    for (const sgRef of attachedSecurityGroups) {
      const groupId = safeString(sgRef.GroupId);
      if (!groupId) {
        continue;
      }

      addEdge(
        `edge-ec2-sg-${instanceId}-${groupId}`,
        instanceNodeId,
        `sg-${groupId}`,
        'secured-by'
      );
    }
  }

  for (const securityGroup of securityGroups) {
    const groupId = safeString(securityGroup.GroupId);
    if (!groupId) {
      continue;
    }

    const groupNodeId = `sg-${groupId}`;
    const label = safeString(securityGroup.GroupName) || groupId;
    addNode(groupNodeId, label, 'sg');
  }

  for (const dbInstance of rdsInstances) {
    const dbIdentifier = safeString(dbInstance.DBInstanceIdentifier);
    if (!dbIdentifier) {
      continue;
    }

    const rdsNodeId = `rds-${dbIdentifier}`;
    addNode(rdsNodeId, dbIdentifier, 'rds');

    const dbSubnetGroup = dbInstance.DBSubnetGroup || {};
    const dbSubnets = Array.isArray(dbSubnetGroup.Subnets) ? dbSubnetGroup.Subnets : [];

    for (const dbSubnet of dbSubnets) {
      const subnetId = safeString(dbSubnet.SubnetIdentifier);
      if (!subnetId) {
        continue;
      }

      addEdge(
        `edge-subnet-rds-${subnetId}-${dbIdentifier}`,
        `subnet-${subnetId}`,
        rdsNodeId,
        'hosts'
      );
    }

    const rdsSecurityGroups = Array.isArray(dbInstance.VpcSecurityGroups)
      ? dbInstance.VpcSecurityGroups
      : [];

    for (const rdsSg of rdsSecurityGroups) {
      const groupId = safeString(rdsSg.VpcSecurityGroupId);
      if (!groupId) {
        continue;
      }

      addEdge(
        `edge-rds-sg-${dbIdentifier}-${groupId}`,
        rdsNodeId,
        `sg-${groupId}`,
        'secured-by'
      );
    }
  }

  console.log(`[graphBuilder] Graph built (nodes=${nodes.length}, edges=${edges.length})`);

  return {
    nodes,
    edges
  };
}

module.exports = {
  buildGraph
};
