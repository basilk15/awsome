const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand
} = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
const { fromIni } = require('@aws-sdk/credential-providers');

async function fetchAwsResources(profile, region) {
  const resolvedProfile = typeof profile === 'string' && profile.trim() ? profile.trim() : 'default';
  const resolvedRegion = typeof region === 'string' && region.trim() ? region.trim() : 'me-south-1';

  console.log(
    `[awsFetcher] Starting AWS fetch (profile=${resolvedProfile}, region=${resolvedRegion})`
  );

  try {
    const credentials = fromIni({ profile: resolvedProfile });

    const ec2Client = new EC2Client({
      region: resolvedRegion,
      credentials
    });

    const rdsClient = new RDSClient({
      region: resolvedRegion,
      credentials
    });

    const [vpcsResponse, subnetsResponse, instancesResponse, securityGroupsResponse, rdsResponse] =
      await Promise.all([
        ec2Client.send(new DescribeVpcsCommand({})),
        ec2Client.send(new DescribeSubnetsCommand({})),
        ec2Client.send(new DescribeInstancesCommand({})),
        ec2Client.send(new DescribeSecurityGroupsCommand({})),
        rdsClient.send(new DescribeDBInstancesCommand({}))
      ]);

    const instances = (instancesResponse.Reservations || []).flatMap((reservation) =>
      reservation.Instances || []
    );

    const data = {
      vpcs: vpcsResponse.Vpcs || [],
      subnets: subnetsResponse.Subnets || [],
      instances,
      securityGroups: securityGroupsResponse.SecurityGroups || [],
      rdsInstances: rdsResponse.DBInstances || []
    };

    console.log(
      `[awsFetcher] Fetch complete (vpcs=${data.vpcs.length}, subnets=${data.subnets.length}, ec2=${data.instances.length}, sg=${data.securityGroups.length}, rds=${data.rdsInstances.length})`
    );

    return data;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error('[awsFetcher] Fetch failed:', message);
    throw new Error(`AWS fetch failed: ${message}`);
  }
}

module.exports = {
  fetchAwsResources
};
