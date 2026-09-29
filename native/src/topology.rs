use aws_config::{BehaviorVersion, Region};
use aws_sdk_ec2::{
    types::{
        EgressOnlyInternetGateway, Instance, InternetGateway, NatGateway, RouteTable,
        SecurityGroup, Subnet, Tag, TransitGateway, TransitGatewayAttachment, TransitGatewayRoute,
        TransitGatewayRouteTable, Vpc, VpcEndpoint, VpcPeeringConnection,
    },
    Client as Ec2Client,
};
use aws_sdk_elasticloadbalancingv2::{
    types::{
        Action, ActionTypeEnum, Listener, LoadBalancer, LoadBalancerTypeEnum, Rule, RuleCondition,
        TargetGroup, TargetHealthDescription, TargetTypeEnum,
    },
    Client as Elbv2Client,
};
use aws_sdk_rds::{types::DbInstance, Client as RdsClient};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
};

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct Graph {
    pub(crate) nodes: Vec<Node>,
    pub(crate) edges: Vec<Edge>,
    pub(crate) warnings: Vec<String>,
    #[serde(default)]
    pub(crate) regions: Vec<String>,
    #[serde(default)]
    pub(crate) coverage: Vec<RegionCoverage>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegionCoverage {
    pub(crate) region: String,
    #[serde(default)]
    pub(crate) unavailable_types: Vec<String>,
    #[serde(default)]
    pub(crate) incomplete_edges: bool,
    #[serde(default)]
    pub(crate) failed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct Node {
    data: NodeData,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct NodeData {
    id: String,
    label: String,
    #[serde(rename = "type")]
    resource_type: String,
    details: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    region: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct Edge {
    data: EdgeData,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct EdgeData {
    id: String,
    source: String,
    target: String,
    label: String,
}

#[derive(Default)]
struct Inventory {
    vpcs: Vec<Vpc>,
    subnets: Vec<Subnet>,
    instances: Vec<Instance>,
    security_groups: Vec<SecurityGroup>,
    rds_instances: Vec<DbInstance>,
    internet_gateways: Vec<InternetGateway>,
    nat_gateways: Vec<NatGateway>,
    route_tables: Vec<RouteTable>,
    vpc_endpoints: Vec<VpcEndpoint>,
    vpc_peering_connections: Vec<VpcPeeringConnection>,
    egress_only_internet_gateways: Vec<EgressOnlyInternetGateway>,
    transit_gateways: Vec<TransitGateway>,
    transit_gateway_attachments: Vec<TransitGatewayAttachment>,
    transit_gateway_route_tables: Vec<TransitGatewayRouteTable>,
    transit_gateway_routes: BTreeMap<String, Vec<TransitGatewayRoute>>,
    load_balancers: Vec<LoadBalancer>,
    listeners: Vec<Listener>,
    listener_rules: BTreeMap<String, Vec<Rule>>,
    target_groups: Vec<TargetGroup>,
    target_health: BTreeMap<String, Vec<TargetHealthDescription>>,
}

#[derive(Default)]
struct GraphBuilder {
    nodes: BTreeMap<String, Node>,
    edges: BTreeMap<String, Edge>,
}

impl GraphBuilder {
    fn add_node(
        &mut self,
        id: impl Into<String>,
        label: impl Into<String>,
        resource_type: &str,
        details: BTreeMap<String, String>,
    ) {
        let id = id.into();
        self.nodes.entry(id.clone()).or_insert_with(|| Node {
            data: NodeData {
                id,
                label: label.into(),
                resource_type: resource_type.to_owned(),
                details,
                region: None,
            },
        });
    }

    fn add_edge(
        &mut self,
        id: impl Into<String>,
        source: impl Into<String>,
        target: impl Into<String>,
        label: impl Into<String>,
    ) {
        let id = id.into();
        let source = source.into();
        let target = target.into();
        if !self.nodes.contains_key(&source) || !self.nodes.contains_key(&target) {
            return;
        }

        self.edges.entry(id.clone()).or_insert_with(|| Edge {
            data: EdgeData {
                id,
                source,
                target,
                label: label.into(),
            },
        });
    }

    fn finish(self) -> Graph {
        Graph {
            nodes: self.nodes.into_values().collect(),
            edges: self.edges.into_values().collect(),
            warnings: Vec::new(),
            regions: Vec::new(),
            coverage: Vec::new(),
        }
    }
}

/// Keeps a topology load useful when AWS denies or temporarily fails one inventory API.
/// Configuration and task failures are intentionally handled by their callers instead.
fn retain_inventory<T: Default>(
    inventory_name: &str,
    result: Result<T, String>,
    warnings: &mut Vec<String>,
) -> T {
    match result {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!(
                "{inventory_name} inventory is unavailable; the topology may be incomplete. {error}"
            ));
            T::default()
        }
    }
}

fn require_inventory_success(failures: &[bool], first_error: &str) -> Result<(), String> {
    if !failures.is_empty() && failures.iter().all(|failed| *failed) {
        return Err(format!(
            "All {} AWS inventory requests failed. Check the profile, region, credentials, and read permissions. First error: {first_error}",
            failures.len()
        ));
    }
    Ok(())
}

fn unavailable_inventory_types(failures: &[bool]) -> BTreeSet<String> {
    let types: [&[&str]; 16] = [
        &["vpc"],
        &["subnet"],
        &["ec2"],
        &["sg"],
        &["rds"],
        &["igw"],
        &["nat"],
        &["route_table"],
        &["vpc_endpoint"],
        &["vpc_peering"],
        &["egress_only_igw"],
        &["transit_gateway"],
        &["transit_gateway_attachment"],
        &["transit_gateway_route_table"],
        &["alb", "nlb", "listener", "listener_rule"],
        &[
            "target_group",
            "target_ec2",
            "target_ip",
            "target_lambda",
            "target_alb",
        ],
    ];
    failures
        .iter()
        .zip(types)
        .filter(|(failed, _)| **failed)
        .flat_map(|(_, names)| names.iter().map(|name| (*name).to_owned()))
        .collect()
}

fn name_tag(tags: &[Tag]) -> Option<String> {
    tags.iter()
        .find(|tag| tag.key() == Some("Name"))
        .and_then(|tag| tag.value())
        .map(str::to_owned)
}

fn details(
    entries: impl IntoIterator<Item = (&'static str, Option<String>)>,
) -> BTreeMap<String, String> {
    entries
        .into_iter()
        .filter_map(|(key, value)| value.map(|value| (key.to_owned(), value)))
        .collect()
}

fn yes_no(value: Option<bool>) -> Option<String> {
    value.map(|value| if value { "Yes" } else { "No" }.to_owned())
}

async fn paginate<T, F, Fut>(mut fetch_page: F) -> Result<Vec<T>, String>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: Future<Output = Result<(Vec<T>, Option<String>), String>>,
{
    let mut resources = Vec::new();
    let mut token = None;
    let mut seen_tokens = BTreeSet::new();

    loop {
        let (mut page_resources, next_token) = fetch_page(token.clone()).await?;
        resources.append(&mut page_resources);
        match next_token {
            Some(next) => {
                if !seen_tokens.insert(next.clone()) {
                    return Err(format!(
                        "AWS returned a repeated pagination token ({next}); stopped to avoid an infinite loop"
                    ));
                }
                token = Some(next);
            }
            None => return Ok(resources),
        }
    }
}

async fn list_vpcs(client: &Ec2Client) -> Result<Vec<Vpc>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_vpcs()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list VPCs: {error}"))?;
        Ok((page.vpcs().to_vec(), page.next_token().map(str::to_owned)))
    })
    .await
}

async fn list_subnets(client: &Ec2Client) -> Result<Vec<Subnet>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_subnets()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list subnets: {error}"))?;
        Ok((
            page.subnets().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_instances(client: &Ec2Client) -> Result<Vec<Instance>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_instances()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list EC2 instances: {error}"))?;
        let instances = page
            .reservations()
            .iter()
            .flat_map(|reservation| reservation.instances().iter().cloned())
            .collect();
        Ok((instances, page.next_token().map(str::to_owned)))
    })
    .await
}

async fn list_security_groups(client: &Ec2Client) -> Result<Vec<SecurityGroup>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_security_groups()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list security groups: {error}"))?;
        Ok((
            page.security_groups().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_internet_gateways(client: &Ec2Client) -> Result<Vec<InternetGateway>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_internet_gateways()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list internet gateways: {error}"))?;
        Ok((
            page.internet_gateways().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_nat_gateways(client: &Ec2Client) -> Result<Vec<NatGateway>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_nat_gateways()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list NAT gateways: {error}"))?;
        Ok((
            page.nat_gateways().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_route_tables(client: &Ec2Client) -> Result<Vec<RouteTable>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_route_tables()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list route tables: {error}"))?;
        Ok((
            page.route_tables().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_vpc_endpoints(client: &Ec2Client) -> Result<Vec<VpcEndpoint>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_vpc_endpoints()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list VPC endpoints: {error}"))?;
        Ok((
            page.vpc_endpoints().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_vpc_peering_connections(
    client: &Ec2Client,
) -> Result<Vec<VpcPeeringConnection>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_vpc_peering_connections()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list VPC peering connections: {error}"))?;
        Ok((
            page.vpc_peering_connections().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_egress_only_internet_gateways(
    client: &Ec2Client,
) -> Result<Vec<EgressOnlyInternetGateway>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_egress_only_internet_gateways()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list egress-only internet gateways: {error}"))?;
        Ok((
            page.egress_only_internet_gateways().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_transit_gateways(client: &Ec2Client) -> Result<Vec<TransitGateway>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_transit_gateways()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list transit gateways: {error}"))?;
        Ok((
            page.transit_gateways().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_transit_gateway_attachments(
    client: &Ec2Client,
) -> Result<Vec<TransitGatewayAttachment>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_transit_gateway_attachments()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list transit gateway attachments: {error}"))?;
        Ok((
            page.transit_gateway_attachments().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_transit_gateway_route_tables(
    client: &Ec2Client,
) -> Result<Vec<TransitGatewayRouteTable>, String> {
    paginate(|next_token| async move {
        let page = client
            .describe_transit_gateway_route_tables()
            .set_next_token(next_token)
            .send()
            .await
            .map_err(|error| format!("could not list transit gateway route tables: {error}"))?;
        Ok((
            page.transit_gateway_route_tables().to_vec(),
            page.next_token().map(str::to_owned),
        ))
    })
    .await
}

async fn list_transit_gateway_routes(
    client: &Ec2Client,
    route_tables: &[TransitGatewayRouteTable],
) -> (BTreeMap<String, Vec<TransitGatewayRoute>>, Vec<String>) {
    let mut routes_by_table = BTreeMap::new();
    let mut warnings = Vec::new();

    for route_table in route_tables {
        let Some(route_table_id) = route_table.transit_gateway_route_table_id() else {
            continue;
        };
        match paginate(|next_token| async move {
            let page = client
                .search_transit_gateway_routes()
                .transit_gateway_route_table_id(route_table_id)
                .set_next_token(next_token)
                .send()
                .await
                .map_err(|error| {
                    format!(
                        "could not list routes for transit gateway route table {route_table_id}: {error}"
                    )
                })?;
            Ok((page.routes().to_vec(), page.next_token().map(str::to_owned)))
        })
        .await
        {
            Ok(routes) => {
                routes_by_table.insert(route_table_id.to_owned(), routes);
            }
            Err(error) => warnings.push(format!(
                "transit gateway route inventory is unavailable for {route_table_id}; \
                 transit route connections may be incomplete. {error}"
            )),
        }
    }

    (routes_by_table, warnings)
}

async fn list_db_instances(client: &RdsClient) -> Result<Vec<DbInstance>, String> {
    paginate(|marker| async move {
        let page = client
            .describe_db_instances()
            .set_marker(marker)
            .send()
            .await
            .map_err(|error| format!("could not list RDS instances: {error}"))?;
        Ok((
            page.db_instances().to_vec(),
            page.marker().map(str::to_owned),
        ))
    })
    .await
}

async fn list_load_balancers(client: &Elbv2Client) -> Result<Vec<LoadBalancer>, String> {
    paginate(|marker| async move {
        let page = client
            .describe_load_balancers()
            .set_marker(marker)
            .send()
            .await
            .map_err(|error| format!("could not list ELBv2 load balancers: {error}"))?;
        Ok((
            page.load_balancers().to_vec(),
            page.next_marker().map(str::to_owned),
        ))
    })
    .await
}

async fn list_target_groups(client: &Elbv2Client) -> Result<Vec<TargetGroup>, String> {
    paginate(|marker| async move {
        let page = client
            .describe_target_groups()
            .set_marker(marker)
            .send()
            .await
            .map_err(|error| format!("could not list ELBv2 target groups: {error}"))?;
        Ok((
            page.target_groups().to_vec(),
            page.next_marker().map(str::to_owned),
        ))
    })
    .await
}

async fn list_listeners(
    client: &Elbv2Client,
    load_balancers: &[LoadBalancer],
) -> Result<(Vec<Listener>, Vec<String>), String> {
    const MAX_CONCURRENT_REQUESTS: usize = 8;
    let mut arns = load_balancers
        .iter()
        .filter(|load_balancer| load_balancer_resource_type(load_balancer).is_some())
        .filter_map(|load_balancer| load_balancer.load_balancer_arn())
        .map(str::to_owned);
    let mut requests = tokio::task::JoinSet::new();
    for _ in 0..MAX_CONCURRENT_REQUESTS {
        let Some(arn) = arns.next() else { break };
        spawn_listener_request(&mut requests, client.clone(), arn);
    }

    let mut listeners = Vec::new();
    let mut warnings = Vec::new();
    while let Some(result) = requests.join_next().await {
        match result.map_err(|error| format!("ELBv2 listener inventory task failed: {error}"))? {
            Ok(mut found) => listeners.append(&mut found),
            Err(error) => warnings.push(format!(
                "ELBv2 listeners are unavailable for one load balancer; its routing paths may be incomplete. {error}"
            )),
        }
        if let Some(arn) = arns.next() {
            spawn_listener_request(&mut requests, client.clone(), arn);
        }
    }
    Ok((listeners, warnings))
}

fn spawn_listener_request(
    requests: &mut tokio::task::JoinSet<Result<Vec<Listener>, String>>,
    client: Elbv2Client,
    load_balancer_arn: String,
) {
    requests.spawn(async move {
        paginate(|marker| async {
            let page = client
                .describe_listeners()
                .load_balancer_arn(&load_balancer_arn)
                .set_marker(marker)
                .send()
                .await
                .map_err(|error| {
                    format!("could not list listeners for {load_balancer_arn}: {error}")
                })?;
            Ok((
                page.listeners().to_vec(),
                page.next_marker().map(str::to_owned),
            ))
        })
        .await
    });
}

async fn list_listener_rules(
    client: &Elbv2Client,
    listeners: &[Listener],
) -> Result<(BTreeMap<String, Vec<Rule>>, Vec<String>), String> {
    const MAX_CONCURRENT_REQUESTS: usize = 8;
    let mut arns = listeners
        .iter()
        .filter_map(|listener| listener.listener_arn())
        .map(str::to_owned);
    let mut requests = tokio::task::JoinSet::new();
    for _ in 0..MAX_CONCURRENT_REQUESTS {
        let Some(arn) = arns.next() else { break };
        spawn_rule_request(&mut requests, client.clone(), arn);
    }

    let mut rules = BTreeMap::new();
    let mut warnings = Vec::new();
    while let Some(result) = requests.join_next().await {
        match result.map_err(|error| format!("ELBv2 rule inventory task failed: {error}"))? {
            Ok((arn, found)) => { rules.insert(arn, found); }
            Err(error) => warnings.push(format!(
                "ELBv2 rules are unavailable for one listener; custom routing paths may be incomplete. {error}"
            )),
        }
        if let Some(arn) = arns.next() {
            spawn_rule_request(&mut requests, client.clone(), arn);
        }
    }
    Ok((rules, warnings))
}

fn spawn_rule_request(
    requests: &mut tokio::task::JoinSet<Result<(String, Vec<Rule>), String>>,
    client: Elbv2Client,
    listener_arn: String,
) {
    requests.spawn(async move {
        let rules = paginate(|marker| async {
            let page = client
                .describe_rules()
                .listener_arn(&listener_arn)
                .set_marker(marker)
                .send()
                .await
                .map_err(|error| format!("could not list rules for {listener_arn}: {error}"))?;
            Ok((page.rules().to_vec(), page.next_marker().map(str::to_owned)))
        })
        .await?;
        Ok((listener_arn, rules))
    });
}

async fn list_target_health(
    client: &Elbv2Client,
    target_groups: &[TargetGroup],
) -> Result<(BTreeMap<String, Vec<TargetHealthDescription>>, Vec<String>), String> {
    const MAX_CONCURRENT_REQUESTS: usize = 8;

    let mut target_health = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut target_group_arns = target_groups
        .iter()
        .filter_map(|target_group| target_group.target_group_arn())
        .map(str::to_owned);
    let mut requests = tokio::task::JoinSet::new();

    for _ in 0..MAX_CONCURRENT_REQUESTS {
        let Some(target_group_arn) = target_group_arns.next() else {
            break;
        };
        spawn_target_health_request(&mut requests, client.clone(), target_group_arn);
    }

    while let Some(result) = requests.join_next().await {
        // A JoinError indicates that the local task was cancelled or panicked. That is not an
        // AWS inventory error and must still fail the topology request.
        match result
            .map_err(|error| format!("ELBv2 target-health inventory task failed: {error}"))?
        {
            Ok((target_group_arn, descriptions)) => {
                target_health.insert(target_group_arn, descriptions);
            }
            Err(error) => warnings.push(format!(
                "ELBv2 registered-target inventory is unavailable for one target group; \
                 load-balancer target connections may be incomplete. {error}"
            )),
        }

        if let Some(target_group_arn) = target_group_arns.next() {
            spawn_target_health_request(&mut requests, client.clone(), target_group_arn);
        }
    }

    Ok((target_health, warnings))
}

fn spawn_target_health_request(
    requests: &mut tokio::task::JoinSet<Result<(String, Vec<TargetHealthDescription>), String>>,
    client: Elbv2Client,
    target_group_arn: String,
) {
    requests.spawn(async move {
        let response = client
            .describe_target_health()
            .target_group_arn(&target_group_arn)
            .send()
            .await
            .map_err(|error| {
                format!(
                    "could not list registered targets for ELBv2 target group \
                     {target_group_arn}: {error}"
                )
            })?;
        Ok((
            target_group_arn,
            response.target_health_descriptions().to_vec(),
        ))
    });
}

fn build_graph(inventory: Inventory) -> Graph {
    let mut graph = GraphBuilder::default();

    for vpc in &inventory.vpcs {
        let Some(vpc_id) = vpc.vpc_id() else {
            continue;
        };
        graph.add_node(
            format!("vpc-{vpc_id}"),
            name_tag(vpc.tags()).unwrap_or_else(|| vpc_id.to_owned()),
            "vpc",
            details([
                ("State", vpc.state().map(|state| state.as_str().to_owned())),
                ("CIDR", vpc.cidr_block().map(str::to_owned)),
                ("Default VPC", yes_no(vpc.is_default())),
            ]),
        );
    }

    for subnet in &inventory.subnets {
        let Some(subnet_id) = subnet.subnet_id() else {
            continue;
        };
        graph.add_node(
            format!("subnet-{subnet_id}"),
            name_tag(subnet.tags()).unwrap_or_else(|| subnet_id.to_owned()),
            "subnet",
            details([
                (
                    "State",
                    subnet.state().map(|state| state.as_str().to_owned()),
                ),
                ("CIDR", subnet.cidr_block().map(str::to_owned)),
                (
                    "Availability Zone",
                    subnet.availability_zone().map(str::to_owned),
                ),
                (
                    "Maps public IP on launch",
                    yes_no(subnet.map_public_ip_on_launch()),
                ),
                ("VPC", subnet.vpc_id().map(str::to_owned)),
            ]),
        );
    }

    for instance in &inventory.instances {
        let Some(instance_id) = instance.instance_id() else {
            continue;
        };
        graph.add_node(
            format!("ec2-{instance_id}"),
            name_tag(instance.tags()).unwrap_or_else(|| instance_id.to_owned()),
            "ec2",
            details([
                (
                    "State",
                    instance
                        .state()
                        .and_then(|state| state.name())
                        .map(|state| state.as_str().to_owned()),
                ),
                (
                    "Instance type",
                    instance
                        .instance_type()
                        .map(|instance_type| instance_type.as_str().to_owned()),
                ),
                (
                    "Private IP",
                    instance.private_ip_address().map(str::to_owned),
                ),
                ("Public IP", instance.public_ip_address().map(str::to_owned)),
                (
                    "Private DNS",
                    instance.private_dns_name().map(str::to_owned),
                ),
                ("Subnet", instance.subnet_id().map(str::to_owned)),
                ("VPC", instance.vpc_id().map(str::to_owned)),
            ]),
        );
    }

    for security_group in &inventory.security_groups {
        let Some(group_id) = security_group.group_id() else {
            continue;
        };
        graph.add_node(
            format!("sg-{group_id}"),
            name_tag(security_group.tags())
                .or_else(|| security_group.group_name().map(str::to_owned))
                .unwrap_or_else(|| group_id.to_owned()),
            "sg",
            details([
                ("Group name", security_group.group_name().map(str::to_owned)),
                (
                    "Description",
                    security_group.description().map(str::to_owned),
                ),
                ("VPC", security_group.vpc_id().map(str::to_owned)),
            ]),
        );
    }

    for db_instance in &inventory.rds_instances {
        let Some(identifier) = db_instance.db_instance_identifier() else {
            continue;
        };
        graph.add_node(
            format!("rds-{identifier}"),
            identifier,
            "rds",
            details([
                ("State", db_instance.db_instance_status().map(str::to_owned)),
                ("Engine", db_instance.engine().map(str::to_owned)),
                (
                    "Engine version",
                    db_instance.engine_version().map(str::to_owned),
                ),
                (
                    "Availability Zone",
                    db_instance.availability_zone().map(str::to_owned),
                ),
                (
                    "Address",
                    db_instance
                        .endpoint()
                        .and_then(|endpoint| endpoint.address())
                        .map(str::to_owned),
                ),
                (
                    "Port",
                    db_instance
                        .endpoint()
                        .and_then(|endpoint| endpoint.port())
                        .map(|port| port.to_string()),
                ),
                ("ARN", db_instance.db_instance_arn().map(str::to_owned)),
            ]),
        );
    }

    for internet_gateway in &inventory.internet_gateways {
        let Some(gateway_id) = internet_gateway.internet_gateway_id() else {
            continue;
        };
        let attachment_states = internet_gateway
            .attachments()
            .iter()
            .filter_map(|attachment| attachment.state())
            .map(|state| state.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        graph.add_node(
            format!("igw-{gateway_id}"),
            name_tag(internet_gateway.tags()).unwrap_or_else(|| gateway_id.to_owned()),
            "igw",
            details([(
                "Attachment state",
                (!attachment_states.is_empty()).then_some(attachment_states),
            )]),
        );
    }

    for nat_gateway in &inventory.nat_gateways {
        let Some(gateway_id) = nat_gateway.nat_gateway_id() else {
            continue;
        };
        let public_ips = nat_gateway
            .nat_gateway_addresses()
            .iter()
            .filter_map(|address| address.public_ip())
            .collect::<Vec<_>>()
            .join(", ");
        let private_ips = nat_gateway
            .nat_gateway_addresses()
            .iter()
            .filter_map(|address| address.private_ip())
            .collect::<Vec<_>>()
            .join(", ");
        graph.add_node(
            format!("nat-{gateway_id}"),
            name_tag(nat_gateway.tags()).unwrap_or_else(|| gateway_id.to_owned()),
            "nat",
            details([
                (
                    "State",
                    nat_gateway.state().map(|state| state.as_str().to_owned()),
                ),
                (
                    "Connectivity",
                    nat_gateway
                        .connectivity_type()
                        .map(|kind| kind.as_str().to_owned()),
                ),
                ("Public IP", (!public_ips.is_empty()).then_some(public_ips)),
                (
                    "Private IP",
                    (!private_ips.is_empty()).then_some(private_ips),
                ),
                ("Subnet", nat_gateway.subnet_id().map(str::to_owned)),
                ("VPC", nat_gateway.vpc_id().map(str::to_owned)),
            ]),
        );
    }

    for route_table in &inventory.route_tables {
        let Some(route_table_id) = route_table.route_table_id() else {
            continue;
        };
        let destinations = route_table
            .routes()
            .iter()
            .filter_map(route_destination)
            .collect::<Vec<_>>()
            .join(", ");
        let is_main = route_table
            .associations()
            .iter()
            .any(|association| association.main() == Some(true));
        graph.add_node(
            format!("route_table-{route_table_id}"),
            name_tag(route_table.tags()).unwrap_or_else(|| route_table_id.to_owned()),
            "route_table",
            details([
                ("VPC", route_table.vpc_id().map(str::to_owned)),
                (
                    "Main route table",
                    Some(if is_main { "Yes" } else { "No" }.to_owned()),
                ),
                (
                    "Route destinations",
                    (!destinations.is_empty()).then_some(destinations),
                ),
            ]),
        );
    }

    for endpoint in &inventory.vpc_endpoints {
        let Some(endpoint_id) = endpoint.vpc_endpoint_id() else {
            continue;
        };
        graph.add_node(
            format!("vpc_endpoint-{endpoint_id}"),
            name_tag(endpoint.tags()).unwrap_or_else(|| endpoint_id.to_owned()),
            "vpc_endpoint",
            details([
                (
                    "Endpoint type",
                    endpoint
                        .vpc_endpoint_type()
                        .map(|endpoint_type| endpoint_type.as_str().to_owned()),
                ),
                (
                    "State",
                    endpoint.state().map(|state| state.as_str().to_owned()),
                ),
                ("Service", endpoint.service_name().map(str::to_owned)),
                ("VPC", endpoint.vpc_id().map(str::to_owned)),
                (
                    "Private DNS enabled",
                    yes_no(endpoint.private_dns_enabled()),
                ),
                (
                    "IP address type",
                    endpoint
                        .ip_address_type()
                        .map(|kind| kind.as_str().to_owned()),
                ),
            ]),
        );
    }

    for peering_connection in &inventory.vpc_peering_connections {
        let Some(connection_id) = peering_connection.vpc_peering_connection_id() else {
            continue;
        };
        graph.add_node(
            format!("vpc_peering-{connection_id}"),
            name_tag(peering_connection.tags()).unwrap_or_else(|| connection_id.to_owned()),
            "vpc_peering",
            details([
                (
                    "State",
                    peering_connection
                        .status()
                        .and_then(|status| status.code())
                        .map(|state| state.as_str().to_owned()),
                ),
                (
                    "Requester VPC",
                    peering_connection
                        .requester_vpc_info()
                        .and_then(|info| info.vpc_id())
                        .map(str::to_owned),
                ),
                (
                    "Requester Region",
                    peering_connection
                        .requester_vpc_info()
                        .and_then(|info| info.region())
                        .map(str::to_owned),
                ),
                (
                    "Accepter VPC",
                    peering_connection
                        .accepter_vpc_info()
                        .and_then(|info| info.vpc_id())
                        .map(str::to_owned),
                ),
                (
                    "Accepter Region",
                    peering_connection
                        .accepter_vpc_info()
                        .and_then(|info| info.region())
                        .map(str::to_owned),
                ),
            ]),
        );
    }

    for gateway in &inventory.egress_only_internet_gateways {
        let Some(gateway_id) = gateway.egress_only_internet_gateway_id() else {
            continue;
        };
        graph.add_node(
            format!("egress_only_igw-{gateway_id}"),
            name_tag(gateway.tags()).unwrap_or_else(|| gateway_id.to_owned()),
            "egress_only_igw",
            details([("Gateway ID", Some(gateway_id.to_owned()))]),
        );
    }

    for transit_gateway in &inventory.transit_gateways {
        let Some(gateway_id) = transit_gateway.transit_gateway_id() else {
            continue;
        };
        graph.add_node(
            format!("transit_gateway-{gateway_id}"),
            name_tag(transit_gateway.tags()).unwrap_or_else(|| gateway_id.to_owned()),
            "transit_gateway",
            details([
                (
                    "State",
                    transit_gateway
                        .state()
                        .map(|state| state.as_str().to_owned()),
                ),
                (
                    "Description",
                    transit_gateway.description().map(str::to_owned),
                ),
                (
                    "Owner account",
                    transit_gateway.owner_id().map(str::to_owned),
                ),
            ]),
        );
    }

    for attachment in &inventory.transit_gateway_attachments {
        let Some(attachment_id) = attachment.transit_gateway_attachment_id() else {
            continue;
        };
        graph.add_node(
            format!("transit_gateway_attachment-{attachment_id}"),
            name_tag(attachment.tags()).unwrap_or_else(|| attachment_id.to_owned()),
            "transit_gateway_attachment",
            details([
                (
                    "State",
                    attachment.state().map(|state| state.as_str().to_owned()),
                ),
                (
                    "Resource type",
                    attachment
                        .resource_type()
                        .map(|resource_type| resource_type.as_str().to_owned()),
                ),
                (
                    "Attached resource",
                    attachment.resource_id().map(str::to_owned),
                ),
                (
                    "Transit gateway",
                    attachment.transit_gateway_id().map(str::to_owned),
                ),
            ]),
        );
    }

    for route_table in &inventory.transit_gateway_route_tables {
        let Some(route_table_id) = route_table.transit_gateway_route_table_id() else {
            continue;
        };
        graph.add_node(
            format!("transit_gateway_route_table-{route_table_id}"),
            name_tag(route_table.tags()).unwrap_or_else(|| route_table_id.to_owned()),
            "transit_gateway_route_table",
            details([
                (
                    "State",
                    route_table.state().map(|state| state.as_str().to_owned()),
                ),
                (
                    "Transit gateway",
                    route_table.transit_gateway_id().map(str::to_owned),
                ),
                (
                    "Default association table",
                    yes_no(route_table.default_association_route_table()),
                ),
                (
                    "Default propagation table",
                    yes_no(route_table.default_propagation_route_table()),
                ),
            ]),
        );
    }

    for load_balancer in &inventory.load_balancers {
        let Some(resource_type) = load_balancer_resource_type(load_balancer) else {
            continue;
        };
        let Some(node_id) = load_balancer_node_id(load_balancer, resource_type) else {
            continue;
        };
        let availability_zones = load_balancer
            .availability_zones()
            .iter()
            .filter_map(|zone| zone.zone_name())
            .collect::<Vec<_>>()
            .join(", ");
        graph.add_node(
            node_id,
            load_balancer
                .load_balancer_name()
                .or_else(|| load_balancer.load_balancer_arn())
                .unwrap_or("load-balancer"),
            resource_type,
            details([
                (
                    "State",
                    load_balancer
                        .state()
                        .and_then(|state| state.code())
                        .map(|state| state.as_str().to_owned()),
                ),
                (
                    "Scheme",
                    load_balancer
                        .scheme()
                        .map(|scheme| scheme.as_str().to_owned()),
                ),
                (
                    "Load balancer type",
                    load_balancer.r#type().map(|kind| kind.as_str().to_owned()),
                ),
                (
                    "IP address type",
                    load_balancer
                        .ip_address_type()
                        .map(|kind| kind.as_str().to_owned()),
                ),
                ("DNS name", load_balancer.dns_name().map(str::to_owned)),
                (
                    "Availability Zones",
                    (!availability_zones.is_empty()).then_some(availability_zones),
                ),
                ("VPC", load_balancer.vpc_id().map(str::to_owned)),
                ("ARN", load_balancer.load_balancer_arn().map(str::to_owned)),
            ]),
        );
    }

    for target_group in &inventory.target_groups {
        let Some(target_group_arn) = target_group.target_group_arn() else {
            continue;
        };
        graph.add_node(
            target_group_node_id(target_group_arn),
            target_group.target_group_name().unwrap_or(target_group_arn),
            "target_group",
            details([
                (
                    "Target type",
                    target_group
                        .target_type()
                        .map(|kind| kind.as_str().to_owned()),
                ),
                (
                    "Protocol",
                    target_group
                        .protocol()
                        .map(|protocol| protocol.as_str().to_owned()),
                ),
                ("Port", target_group.port().map(|port| port.to_string())),
                (
                    "Protocol version",
                    target_group.protocol_version().map(str::to_owned),
                ),
                (
                    "Health check protocol",
                    target_group
                        .health_check_protocol()
                        .map(|protocol| protocol.as_str().to_owned()),
                ),
                (
                    "Health check port",
                    target_group.health_check_port().map(str::to_owned),
                ),
                (
                    "Health check path",
                    target_group.health_check_path().map(str::to_owned),
                ),
                ("VPC", target_group.vpc_id().map(str::to_owned)),
                ("ARN", Some(target_group_arn.to_owned())),
            ]),
        );
    }

    for listener in &inventory.listeners {
        let Some(arn) = listener.listener_arn() else {
            continue;
        };
        let label = match (listener.protocol(), listener.port()) {
            (Some(protocol), Some(port)) => format!("{}:{port}", protocol.as_str()),
            (Some(protocol), None) => protocol.as_str().to_owned(),
            (None, Some(port)) => format!("Port {port}"),
            (None, None) => "Listener".to_owned(),
        };
        graph.add_node(
            listener_node_id(arn),
            label,
            "listener",
            details([
                (
                    "Protocol",
                    listener.protocol().map(|value| value.as_str().to_owned()),
                ),
                ("Port", listener.port().map(|value| value.to_string())),
                (
                    "Load balancer",
                    listener.load_balancer_arn().map(str::to_owned),
                ),
                ("ARN", Some(arn.to_owned())),
            ]),
        );
        if !listener.default_actions().is_empty() {
            graph.add_node(
                default_rule_node_id(arn),
                "Default rule",
                "listener_rule",
                details([
                    ("Priority", Some("default".to_owned())),
                    ("Actions", Some(action_summary(listener.default_actions()))),
                    ("Listener", Some(arn.to_owned())),
                ]),
            );
        }
        for rule in inventory.listener_rules.get(arn).into_iter().flatten() {
            if rule.is_default() == Some(true) {
                continue;
            }
            let Some(rule_arn) = rule.rule_arn() else {
                continue;
            };
            let priority = rule.priority().unwrap_or("unknown");
            graph.add_node(
                listener_rule_node_id(rule_arn),
                format!("Rule {priority}"),
                "listener_rule",
                details([
                    ("Priority", Some(priority.to_owned())),
                    (
                        "Conditions",
                        Some(rule_conditions_summary(rule.conditions())),
                    ),
                    ("Actions", Some(action_summary(rule.actions()))),
                    ("Listener", Some(arn.to_owned())),
                    ("ARN", Some(rule_arn.to_owned())),
                ]),
            );
        }
    }

    add_inventory_edges(&mut graph, &inventory);
    graph.finish()
}

fn add_inventory_edges(graph: &mut GraphBuilder, inventory: &Inventory) {
    for subnet in &inventory.subnets {
        if let (Some(subnet_id), Some(vpc_id)) = (subnet.subnet_id(), subnet.vpc_id()) {
            graph.add_edge(
                format!("edge-vpc-subnet-{vpc_id}-{subnet_id}"),
                format!("vpc-{vpc_id}"),
                format!("subnet-{subnet_id}"),
                "contains subnet",
            );
        }
    }

    for instance in &inventory.instances {
        let Some(instance_id) = instance.instance_id() else {
            continue;
        };
        if let Some(subnet_id) = instance.subnet_id() {
            graph.add_edge(
                format!("edge-subnet-ec2-{subnet_id}-{instance_id}"),
                format!("subnet-{subnet_id}"),
                format!("ec2-{instance_id}"),
                "hosts EC2 instance",
            );
        }
        for group in instance.security_groups() {
            if let Some(group_id) = group.group_id() {
                graph.add_edge(
                    format!("edge-ec2-sg-{instance_id}-{group_id}"),
                    format!("ec2-{instance_id}"),
                    format!("sg-{group_id}"),
                    "secured by security group",
                );
            }
        }
    }

    for security_group in &inventory.security_groups {
        if let (Some(group_id), Some(vpc_id)) = (security_group.group_id(), security_group.vpc_id())
        {
            graph.add_edge(
                format!("edge-vpc-sg-{vpc_id}-{group_id}"),
                format!("vpc-{vpc_id}"),
                format!("sg-{group_id}"),
                "contains security group",
            );
        }
    }

    for db_instance in &inventory.rds_instances {
        let Some(identifier) = db_instance.db_instance_identifier() else {
            continue;
        };
        if let Some(subnet_group) = db_instance.db_subnet_group() {
            for subnet in subnet_group.subnets() {
                if let Some(subnet_id) = subnet.subnet_identifier() {
                    graph.add_edge(
                        format!("edge-subnet-rds-{subnet_id}-{identifier}"),
                        format!("subnet-{subnet_id}"),
                        format!("rds-{identifier}"),
                        "hosts RDS subnet placement",
                    );
                }
            }
        }
        for security_group in db_instance.vpc_security_groups() {
            if let Some(group_id) = security_group.vpc_security_group_id() {
                graph.add_edge(
                    format!("edge-rds-sg-{identifier}-{group_id}"),
                    format!("rds-{identifier}"),
                    format!("sg-{group_id}"),
                    "secured by security group",
                );
            }
        }
    }

    for internet_gateway in &inventory.internet_gateways {
        let Some(gateway_id) = internet_gateway.internet_gateway_id() else {
            continue;
        };
        for attachment in internet_gateway.attachments() {
            if let Some(vpc_id) = attachment.vpc_id() {
                graph.add_edge(
                    format!("edge-vpc-igw-{vpc_id}-{gateway_id}"),
                    format!("vpc-{vpc_id}"),
                    format!("igw-{gateway_id}"),
                    "attached internet gateway",
                );
            }
        }
    }

    for nat_gateway in &inventory.nat_gateways {
        let Some(gateway_id) = nat_gateway.nat_gateway_id() else {
            continue;
        };
        if let Some(vpc_id) = nat_gateway.vpc_id() {
            graph.add_edge(
                format!("edge-vpc-nat-{vpc_id}-{gateway_id}"),
                format!("vpc-{vpc_id}"),
                format!("nat-{gateway_id}"),
                "contains NAT gateway",
            );
        }
        if let Some(subnet_id) = nat_gateway.subnet_id() {
            graph.add_edge(
                format!("edge-subnet-nat-{subnet_id}-{gateway_id}"),
                format!("subnet-{subnet_id}"),
                format!("nat-{gateway_id}"),
                "hosts NAT gateway",
            );
        }
    }

    add_extended_network_edges(graph, inventory);
    add_route_table_edges(graph, inventory);

    for load_balancer in &inventory.load_balancers {
        let Some(resource_type) = load_balancer_resource_type(load_balancer) else {
            continue;
        };
        let Some(load_balancer_node) = load_balancer_node_id(load_balancer, resource_type) else {
            continue;
        };
        if let Some(vpc_id) = load_balancer.vpc_id() {
            graph.add_edge(
                format!("edge-vpc-{resource_type}-{vpc_id}-{load_balancer_node}"),
                format!("vpc-{vpc_id}"),
                load_balancer_node.clone(),
                format!("contains {}", load_balancer_kind_label(resource_type)),
            );
        }
        for zone in load_balancer.availability_zones() {
            if let Some(subnet_id) = zone.subnet_id() {
                graph.add_edge(
                    format!("edge-subnet-{resource_type}-{subnet_id}-{load_balancer_node}"),
                    format!("subnet-{subnet_id}"),
                    load_balancer_node.clone(),
                    format!(
                        "provides subnet to {}",
                        load_balancer_kind_label(resource_type)
                    ),
                );
            }
        }
        for group_id in load_balancer.security_groups() {
            graph.add_edge(
                format!("edge-{resource_type}-sg-{load_balancer_node}-{group_id}"),
                load_balancer_node.clone(),
                format!("sg-{group_id}"),
                "secured by security group",
            );
        }
    }

    add_load_balancer_target_topology(graph, inventory);
}

fn add_extended_network_edges(graph: &mut GraphBuilder, inventory: &Inventory) {
    for endpoint in &inventory.vpc_endpoints {
        let Some(endpoint_id) = endpoint.vpc_endpoint_id() else {
            continue;
        };
        let endpoint_node = format!("vpc_endpoint-{endpoint_id}");
        if let Some(vpc_id) = endpoint.vpc_id() {
            graph.add_edge(
                format!("edge-vpc-vpc-endpoint-{vpc_id}-{endpoint_id}"),
                format!("vpc-{vpc_id}"),
                endpoint_node.clone(),
                "contains VPC endpoint",
            );
        }
        for route_table_id in endpoint.route_table_ids() {
            graph.add_edge(
                format!("edge-route-table-vpc-endpoint-{route_table_id}-{endpoint_id}"),
                format!("route_table-{route_table_id}"),
                endpoint_node.clone(),
                "routes through VPC endpoint",
            );
        }
        for subnet_id in endpoint.subnet_ids() {
            graph.add_edge(
                format!("edge-subnet-vpc-endpoint-{subnet_id}-{endpoint_id}"),
                format!("subnet-{subnet_id}"),
                endpoint_node.clone(),
                "hosts VPC endpoint interface",
            );
        }
        for group in endpoint.groups() {
            if let Some(group_id) = group.group_id() {
                graph.add_edge(
                    format!("edge-vpc-endpoint-sg-{endpoint_id}-{group_id}"),
                    endpoint_node.clone(),
                    format!("sg-{group_id}"),
                    "secured by security group",
                );
            }
        }
    }

    for connection in &inventory.vpc_peering_connections {
        let Some(connection_id) = connection.vpc_peering_connection_id() else {
            continue;
        };
        let connection_node = format!("vpc_peering-{connection_id}");
        if let Some(vpc_id) = connection
            .requester_vpc_info()
            .and_then(|info| info.vpc_id())
        {
            graph.add_edge(
                format!("edge-vpc-peering-requester-{vpc_id}-{connection_id}"),
                format!("vpc-{vpc_id}"),
                connection_node.clone(),
                "requests VPC peering",
            );
        }
        if let Some(vpc_id) = connection
            .accepter_vpc_info()
            .and_then(|info| info.vpc_id())
        {
            graph.add_edge(
                format!("edge-vpc-peering-accepter-{connection_id}-{vpc_id}"),
                connection_node.clone(),
                format!("vpc-{vpc_id}"),
                "accepted by VPC",
            );
        }
    }

    for gateway in &inventory.egress_only_internet_gateways {
        let Some(gateway_id) = gateway.egress_only_internet_gateway_id() else {
            continue;
        };
        for attachment in gateway.attachments() {
            if let Some(vpc_id) = attachment.vpc_id() {
                graph.add_edge(
                    format!("edge-vpc-egress-only-igw-{vpc_id}-{gateway_id}"),
                    format!("vpc-{vpc_id}"),
                    format!("egress_only_igw-{gateway_id}"),
                    "attached egress-only internet gateway",
                );
            }
        }
    }

    for attachment in &inventory.transit_gateway_attachments {
        let Some(attachment_id) = attachment.transit_gateway_attachment_id() else {
            continue;
        };
        let attachment_node = format!("transit_gateway_attachment-{attachment_id}");
        if let Some(gateway_id) = attachment.transit_gateway_id() {
            graph.add_edge(
                format!("edge-transit-gateway-attachment-{gateway_id}-{attachment_id}"),
                format!("transit_gateway-{gateway_id}"),
                attachment_node.clone(),
                "has transit gateway attachment",
            );
        }
        if attachment
            .resource_type()
            .is_some_and(|resource_type| resource_type.as_str() == "vpc")
        {
            if let Some(vpc_id) = attachment.resource_id() {
                graph.add_edge(
                    format!("edge-transit-gateway-attachment-vpc-{attachment_id}-{vpc_id}"),
                    attachment_node,
                    format!("vpc-{vpc_id}"),
                    "connects VPC attachment",
                );
            }
        }
    }

    for route_table in &inventory.transit_gateway_route_tables {
        let (Some(route_table_id), Some(gateway_id)) = (
            route_table.transit_gateway_route_table_id(),
            route_table.transit_gateway_id(),
        ) else {
            continue;
        };
        graph.add_edge(
            format!("edge-transit-gateway-route-table-{gateway_id}-{route_table_id}"),
            format!("transit_gateway-{gateway_id}"),
            format!("transit_gateway_route_table-{route_table_id}"),
            "contains transit gateway route table",
        );

        for (route_index, route) in inventory
            .transit_gateway_routes
            .get(route_table_id)
            .into_iter()
            .flatten()
            .enumerate()
        {
            let Some(destination) = route
                .destination_cidr_block()
                .or_else(|| route.prefix_list_id())
            else {
                continue;
            };
            for (attachment_index, attachment) in
                route.transit_gateway_attachments().iter().enumerate()
            {
                let Some(attachment_id) = attachment.transit_gateway_attachment_id() else {
                    continue;
                };
                graph.add_edge(
                    format!(
                        "edge-transit-gateway-route-{route_table_id}-{route_index}-{attachment_index}-{attachment_id}"
                    ),
                    format!("transit_gateway_route_table-{route_table_id}"),
                    format!("transit_gateway_attachment-{attachment_id}"),
                    format!("routes {destination} to attachment"),
                );
            }
        }
    }
}

fn add_load_balancer_target_topology(graph: &mut GraphBuilder, inventory: &Inventory) {
    let load_balancer_nodes = inventory
        .load_balancers
        .iter()
        .filter_map(|load_balancer| {
            let resource_type = load_balancer_resource_type(load_balancer)?;
            Some((
                load_balancer.load_balancer_arn()?,
                load_balancer_node_id(load_balancer, resource_type)?,
            ))
        })
        .collect::<BTreeMap<_, _>>();

    for target_group in &inventory.target_groups {
        let Some(target_group_arn) = target_group.target_group_arn() else {
            continue;
        };
        let target_group_node = target_group_node_id(target_group_arn);
        let target_type = target_group.target_type();

        if let Some(vpc_id) = target_group.vpc_id() {
            graph.add_edge(
                format!("edge-vpc-target-group-{vpc_id}-{target_group_arn}"),
                format!("vpc-{vpc_id}"),
                target_group_node.clone(),
                "contains load balancer target group",
            );
        }

        for (index, description) in inventory
            .target_health
            .get(target_group_arn)
            .into_iter()
            .flatten()
            .enumerate()
        {
            let Some(target) = description.target() else {
                continue;
            };
            let Some(target_id) = target.id() else {
                continue;
            };
            let Some((resource_type, target_kind)) = target_registration_type(target_type) else {
                continue;
            };
            let target_node = target_registration_node_id(
                resource_type,
                target_group_arn,
                target_id,
                target.port(),
                index,
            );
            graph.add_node(
                target_node.clone(),
                target_id,
                resource_type,
                target_registration_details(target_group, description),
            );
            graph.add_edge(
                format!("edge-target-group-target-{target_group_arn}-{index}-{target_id}"),
                target_group_node.clone(),
                target_node,
                target_registration_label(target_kind, target_group, description),
            );
        }
    }

    for listener in &inventory.listeners {
        let (Some(listener_arn), Some(load_balancer_arn)) =
            (listener.listener_arn(), listener.load_balancer_arn())
        else {
            continue;
        };
        let Some(load_balancer_node) = load_balancer_nodes.get(load_balancer_arn) else {
            continue;
        };
        let listener_node = listener_node_id(listener_arn);
        graph.add_edge(
            format!("edge-load-balancer-listener-{listener_arn}"),
            load_balancer_node.clone(),
            listener_node.clone(),
            "accepts traffic on listener",
        );
        if !listener.default_actions().is_empty() {
            let rule_node = default_rule_node_id(listener_arn);
            graph.add_edge(
                format!("edge-listener-default-rule-{listener_arn}"),
                listener_node.clone(),
                rule_node.clone(),
                "uses default rule",
            );
            add_rule_target_edges(graph, &rule_node, listener.default_actions());
        }
        for rule in inventory
            .listener_rules
            .get(listener_arn)
            .into_iter()
            .flatten()
        {
            if rule.is_default() == Some(true) {
                continue;
            }
            let Some(rule_arn) = rule.rule_arn() else {
                continue;
            };
            let rule_node = listener_rule_node_id(rule_arn);
            graph.add_edge(
                format!("edge-listener-rule-{rule_arn}"),
                listener_node.clone(),
                rule_node.clone(),
                format!(
                    "evaluates priority {}",
                    rule.priority().unwrap_or("unknown")
                ),
            );
            add_rule_target_edges(graph, &rule_node, rule.actions());
        }
    }
}

fn target_group_node_id(target_group_arn: &str) -> String {
    format!("target_group-{target_group_arn}")
}

fn listener_node_id(arn: &str) -> String {
    format!("listener-{arn}")
}

fn listener_rule_node_id(arn: &str) -> String {
    format!("listener_rule-{arn}")
}

fn default_rule_node_id(listener_arn: &str) -> String {
    format!("listener_rule-default-{listener_arn}")
}

fn action_summary(actions: &[Action]) -> String {
    actions
        .iter()
        .filter_map(|action| action.r#type().map(|kind| kind.as_str()))
        .collect::<Vec<_>>()
        .join(", ")
}

fn rule_conditions_summary(conditions: &[RuleCondition]) -> String {
    if conditions.is_empty() {
        return "All requests".to_owned();
    }
    conditions
        .iter()
        .map(|condition| {
            let field = condition.field().unwrap_or("condition");
            let mut values = condition.values().to_vec();
            values.extend(
                condition
                    .regex_values()
                    .iter()
                    .map(|value| format!("regex {value}")),
            );
            if let Some(config) = condition.host_header_config() {
                values.extend(config.values().iter().cloned());
                values.extend(
                    config
                        .regex_values()
                        .iter()
                        .map(|value| format!("regex {value}")),
                );
            }
            if let Some(config) = condition.path_pattern_config() {
                values.extend(config.values().iter().cloned());
                values.extend(
                    config
                        .regex_values()
                        .iter()
                        .map(|value| format!("regex {value}")),
                );
            }
            if let Some(config) = condition.http_header_config() {
                values.extend(config.values().iter().cloned());
                values.extend(
                    config
                        .regex_values()
                        .iter()
                        .map(|value| format!("regex {value}")),
                );
            }
            if let Some(config) = condition.query_string_config() {
                values.extend(config.values().iter().map(|pair| match pair.key() {
                    Some(key) => format!("{key}={}", pair.value().unwrap_or("")),
                    None => pair.value().unwrap_or("").to_owned(),
                }));
            }
            if let Some(config) = condition.http_request_method_config() {
                values.extend(config.values().iter().cloned());
            }
            if let Some(config) = condition.source_ip_config() {
                values.extend(config.values().iter().cloned());
            }
            values.sort();
            values.dedup();
            let field = condition
                .http_header_config()
                .and_then(|config| config.http_header_name())
                .map(|header| format!("{field} ({header})"))
                .unwrap_or_else(|| field.to_owned());
            if values.is_empty() {
                field
            } else {
                format!("{field}: {}", values.join(", "))
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn add_rule_target_edges(graph: &mut GraphBuilder, rule_node: &str, actions: &[Action]) {
    for action in actions {
        if !matches!(action.r#type(), Some(ActionTypeEnum::Forward)) {
            continue;
        }
        let mut target_groups = BTreeMap::new();
        if let Some(arn) = action.target_group_arn() {
            target_groups.insert(arn.to_owned(), None);
        }
        if let Some(config) = action.forward_config() {
            for group in config.target_groups() {
                if let Some(arn) = group.target_group_arn() {
                    target_groups.insert(arn.to_owned(), group.weight());
                }
            }
        }
        for (arn, weight) in target_groups {
            graph.add_edge(
                format!("edge-rule-target-group-{rule_node}-{arn}"),
                rule_node.to_owned(),
                target_group_node_id(&arn),
                match weight {
                    Some(0) => "configured target group (weight 0; no traffic)".to_owned(),
                    Some(value) => format!("forwards to target group (weight {value})"),
                    None => "forwards to target group".to_owned(),
                },
            );
        }
    }
}

fn target_registration_type(
    target_type: Option<&TargetTypeEnum>,
) -> Option<(&'static str, &'static str)> {
    match target_type {
        Some(TargetTypeEnum::Instance) => Some(("target_ec2", "EC2")),
        Some(TargetTypeEnum::Ip) => Some(("target_ip", "IP")),
        Some(TargetTypeEnum::Lambda) => Some(("target_lambda", "Lambda")),
        Some(TargetTypeEnum::Alb) => Some(("target_alb", "Application Load Balancer")),
        _ => None,
    }
}

fn target_registration_node_id(
    resource_type: &str,
    target_group_arn: &str,
    target_id: &str,
    port: Option<i32>,
    index: usize,
) -> String {
    // A target can be registered more than once in one group (for example, on
    // distinct ports). Keep every observed registration distinct and avoid
    // relying on another AWS inventory to make the path renderable.
    format!(
        "{resource_type}-{target_group_arn}-{target_id}-{}-{index}",
        port.map_or_else(|| "default".to_owned(), |port| port.to_string())
    )
}

fn target_registration_details(
    target_group: &TargetGroup,
    description: &TargetHealthDescription,
) -> BTreeMap<String, String> {
    let target = description.target();
    let health = description.target_health();
    details([
        (
            "Target type",
            target_group
                .target_type()
                .map(|kind| kind.as_str().to_owned()),
        ),
        (
            "Protocol",
            target_group
                .protocol()
                .map(|protocol| protocol.as_str().to_owned()),
        ),
        (
            "Target port",
            target
                .and_then(|target| target.port())
                .map(|port| port.to_string()),
        ),
        (
            "Availability Zone",
            target
                .and_then(|target| target.availability_zone())
                .map(str::to_owned),
        ),
        (
            "Health check port",
            description.health_check_port().map(str::to_owned),
        ),
        (
            "Health state",
            health
                .and_then(|health| health.state())
                .map(|state| state.as_str().to_owned()),
        ),
        (
            "Health reason",
            health
                .and_then(|health| health.reason())
                .map(|reason| reason.as_str().to_owned()),
        ),
        (
            "Health description",
            health
                .and_then(|health| health.description())
                .map(str::to_owned),
        ),
    ])
}

fn target_registration_label(
    target_kind: &str,
    target_group: &TargetGroup,
    description: &TargetHealthDescription,
) -> String {
    let target = description.target();
    let health = description.target_health();
    let mut attributes = Vec::new();
    if let Some(protocol) = target_group.protocol() {
        attributes.push(protocol.as_str().to_owned());
    }
    if let Some(port) = target.and_then(|target| target.port()) {
        attributes.push(port.to_string());
    }
    if let Some(state) = health.and_then(|health| health.state()) {
        attributes.push(state.as_str().to_owned());
    }
    if let Some(reason) = health.and_then(|health| health.reason()) {
        attributes.push(reason.as_str().to_owned());
    }
    if attributes.is_empty() {
        format!("registered {target_kind} target")
    } else {
        format!(
            "registered {target_kind} target ({})",
            attributes.join("; ")
        )
    }
}

fn add_route_table_edges(graph: &mut GraphBuilder, inventory: &Inventory) {
    let explicitly_associated_subnets = inventory
        .route_tables
        .iter()
        .flat_map(|route_table| route_table.associations())
        .filter_map(|association| association.subnet_id())
        .collect::<BTreeSet<_>>();

    for route_table in &inventory.route_tables {
        let Some(route_table_id) = route_table.route_table_id() else {
            continue;
        };
        let route_table_node = format!("route_table-{route_table_id}");
        if let Some(vpc_id) = route_table.vpc_id() {
            graph.add_edge(
                format!("edge-vpc-route-table-{vpc_id}-{route_table_id}"),
                format!("vpc-{vpc_id}"),
                route_table_node.clone(),
                "contains route table",
            );
        }
        for association in route_table.associations() {
            if let Some(subnet_id) = association.subnet_id() {
                graph.add_edge(
                    format!("edge-route-table-subnet-{route_table_id}-{subnet_id}"),
                    route_table_node.clone(),
                    format!("subnet-{subnet_id}"),
                    "explicit route table association",
                );
            }
        }
        if route_table
            .associations()
            .iter()
            .any(|association| association.main() == Some(true))
        {
            if let Some(vpc_id) = route_table.vpc_id() {
                for subnet in inventory.subnets.iter().filter(|subnet| {
                    subnet.vpc_id() == Some(vpc_id)
                        && subnet
                            .subnet_id()
                            .is_some_and(|id| !explicitly_associated_subnets.contains(id))
                }) {
                    if let Some(subnet_id) = subnet.subnet_id() {
                        graph.add_edge(
                            format!("edge-route-table-main-subnet-{route_table_id}-{subnet_id}"),
                            route_table_node.clone(),
                            format!("subnet-{subnet_id}"),
                            "effective main route table",
                        );
                    }
                }
            }
        }
        for (index, route) in route_table.routes().iter().enumerate() {
            let destination =
                route_destination(route).unwrap_or_else(|| "unspecified destination".to_owned());
            let target = if let Some(gateway_id) = route.gateway_id() {
                if gateway_id.starts_with("igw-") {
                    Some(format!("igw-{gateway_id}"))
                } else {
                    gateway_id
                        .starts_with("vpce-")
                        .then(|| format!("vpc_endpoint-{gateway_id}"))
                }
            } else if let Some(nat_gateway_id) = route.nat_gateway_id() {
                Some(format!("nat-{nat_gateway_id}"))
            } else if let Some(gateway_id) = route.egress_only_internet_gateway_id() {
                Some(format!("egress_only_igw-{gateway_id}"))
            } else if let Some(connection_id) = route.vpc_peering_connection_id() {
                Some(format!("vpc_peering-{connection_id}"))
            } else if let Some(gateway_id) = route.transit_gateway_id() {
                Some(format!("transit_gateway-{gateway_id}"))
            } else {
                route
                    .instance_id()
                    .map(|instance_id| format!("ec2-{instance_id}"))
            };
            if let Some(target) = target {
                graph.add_edge(
                    format!("edge-route-{route_table_id}-{index}-{target}"),
                    route_table_node.clone(),
                    target,
                    format!("routes {destination} to target"),
                );
            }
        }
    }
}

fn route_destination(route: &aws_sdk_ec2::types::Route) -> Option<String> {
    route
        .destination_cidr_block()
        .or_else(|| route.destination_ipv6_cidr_block())
        .or_else(|| route.destination_prefix_list_id())
        .map(str::to_owned)
}

fn load_balancer_resource_type(load_balancer: &LoadBalancer) -> Option<&'static str> {
    match load_balancer.r#type() {
        Some(LoadBalancerTypeEnum::Application) => Some("alb"),
        Some(LoadBalancerTypeEnum::Network) => Some("nlb"),
        _ => None,
    }
}

fn load_balancer_node_id(load_balancer: &LoadBalancer, resource_type: &str) -> Option<String> {
    load_balancer
        .load_balancer_arn()
        .or_else(|| load_balancer.load_balancer_name())
        .map(|identifier| format!("{resource_type}-{identifier}"))
}

fn load_balancer_kind_label(resource_type: &str) -> &'static str {
    match resource_type {
        "alb" => "application load balancer",
        "nlb" => "network load balancer",
        _ => "load balancer",
    }
}

async fn tracked<F: Future>(
    name: &'static str,
    progress: &(dyn Fn(&str) + Send + Sync),
    future: F,
) -> F::Output {
    let result = future.await;
    progress(name);
    result
}

pub(crate) async fn fetch_topology(
    profile: String,
    region: String,
    progress: &(dyn Fn(&str) + Send + Sync),
) -> Result<Graph, String> {
    let profile = if profile.trim().is_empty() {
        "default"
    } else {
        profile.trim()
    };
    let region = if region.trim().is_empty() {
        "me-south-1"
    } else {
        region.trim()
    };

    let sdk_config = aws_config::defaults(BehaviorVersion::latest())
        .profile_name(profile)
        .region(Region::new(region.to_owned()))
        .load()
        .await;
    progress("AWS credentials ready");

    let ec2 = Ec2Client::new(&sdk_config);
    let rds = RdsClient::new(&sdk_config);
    let elbv2 = Elbv2Client::new(&sdk_config);

    let (
        vpcs_result,
        subnets_result,
        instances_result,
        security_groups_result,
        rds_instances_result,
        internet_gateways_result,
        nat_gateways_result,
        route_tables_result,
        vpc_endpoints_result,
        vpc_peering_connections_result,
        egress_only_internet_gateways_result,
        transit_gateways_result,
        transit_gateway_attachments_result,
        transit_gateway_route_tables_result,
        load_balancers_result,
        target_groups_result,
    ) = tokio::join!(
        tracked("VPCs", progress, list_vpcs(&ec2)),
        tracked("subnets", progress, list_subnets(&ec2)),
        tracked("EC2 instances", progress, list_instances(&ec2)),
        tracked("security groups", progress, list_security_groups(&ec2)),
        tracked("RDS instances", progress, list_db_instances(&rds)),
        tracked("internet gateways", progress, list_internet_gateways(&ec2)),
        tracked("NAT gateways", progress, list_nat_gateways(&ec2)),
        tracked("route tables", progress, list_route_tables(&ec2)),
        tracked("VPC endpoints", progress, list_vpc_endpoints(&ec2)),
        tracked("VPC peering", progress, list_vpc_peering_connections(&ec2)),
        tracked(
            "egress-only gateways",
            progress,
            list_egress_only_internet_gateways(&ec2)
        ),
        tracked("transit gateways", progress, list_transit_gateways(&ec2)),
        tracked(
            "transit attachments",
            progress,
            list_transit_gateway_attachments(&ec2)
        ),
        tracked(
            "transit route tables",
            progress,
            list_transit_gateway_route_tables(&ec2)
        ),
        tracked("load balancers", progress, list_load_balancers(&elbv2)),
        tracked("target groups", progress, list_target_groups(&elbv2)),
    );

    let failures = [
        vpcs_result.is_err(),
        subnets_result.is_err(),
        instances_result.is_err(),
        security_groups_result.is_err(),
        rds_instances_result.is_err(),
        internet_gateways_result.is_err(),
        nat_gateways_result.is_err(),
        route_tables_result.is_err(),
        vpc_endpoints_result.is_err(),
        vpc_peering_connections_result.is_err(),
        egress_only_internet_gateways_result.is_err(),
        transit_gateways_result.is_err(),
        transit_gateway_attachments_result.is_err(),
        transit_gateway_route_tables_result.is_err(),
        load_balancers_result.is_err(),
        target_groups_result.is_err(),
    ];
    require_inventory_success(
        &failures,
        vpcs_result
            .as_ref()
            .err()
            .map(String::as_str)
            .unwrap_or("AWS inventory unavailable"),
    )?;

    let mut unavailable_types = unavailable_inventory_types(&failures);

    let mut warnings = Vec::new();
    let vpcs = retain_inventory("VPC", vpcs_result, &mut warnings);
    let subnets = retain_inventory("subnet", subnets_result, &mut warnings);
    let instances = retain_inventory("EC2 instance", instances_result, &mut warnings);
    let security_groups = retain_inventory("security group", security_groups_result, &mut warnings);
    let rds_instances = retain_inventory("RDS instance", rds_instances_result, &mut warnings);
    let internet_gateways =
        retain_inventory("internet gateway", internet_gateways_result, &mut warnings);
    let nat_gateways = retain_inventory("NAT gateway", nat_gateways_result, &mut warnings);
    let route_tables = retain_inventory("route table", route_tables_result, &mut warnings);
    let vpc_endpoints = retain_inventory("VPC endpoint", vpc_endpoints_result, &mut warnings);
    let vpc_peering_connections = retain_inventory(
        "VPC peering connection",
        vpc_peering_connections_result,
        &mut warnings,
    );
    let egress_only_internet_gateways = retain_inventory(
        "egress-only internet gateway",
        egress_only_internet_gateways_result,
        &mut warnings,
    );
    let transit_gateways =
        retain_inventory("transit gateway", transit_gateways_result, &mut warnings);
    let transit_gateway_attachments = retain_inventory(
        "transit gateway attachment",
        transit_gateway_attachments_result,
        &mut warnings,
    );
    let transit_gateway_route_tables = retain_inventory(
        "transit gateway route table",
        transit_gateway_route_tables_result,
        &mut warnings,
    );
    let load_balancers =
        retain_inventory("ELBv2 load balancer", load_balancers_result, &mut warnings);
    let target_groups = retain_inventory("ELBv2 target group", target_groups_result, &mut warnings);

    let (
        listeners_result,
        target_health_result,
        (transit_gateway_routes, transit_gateway_route_warnings),
    ) = tokio::join!(
        tracked(
            "listeners",
            progress,
            list_listeners(&elbv2, &load_balancers)
        ),
        tracked(
            "target health",
            progress,
            list_target_health(&elbv2, &target_groups)
        ),
        tracked(
            "transit routes",
            progress,
            list_transit_gateway_routes(&ec2, &transit_gateway_route_tables)
        ),
    );
    let (listeners, listener_warnings) =
        listeners_result.map_err(|error| format!("AWS inventory request failed: {error}"))?;
    if !listener_warnings.is_empty() {
        unavailable_types.extend(["listener", "listener_rule"].map(str::to_owned));
    }
    warnings.extend(listener_warnings);
    let (target_health, target_health_warnings) =
        target_health_result.map_err(|error| format!("AWS inventory request failed: {error}"))?;
    if !target_health_warnings.is_empty() {
        unavailable_types
            .extend(["target_ec2", "target_ip", "target_lambda", "target_alb"].map(str::to_owned));
    }
    warnings.extend(target_health_warnings);
    warnings.extend(transit_gateway_route_warnings);
    let (listener_rules, rule_warnings) = list_listener_rules(&elbv2, &listeners)
        .await
        .map_err(|error| format!("AWS inventory request failed: {error}"))?;
    progress("listener rules");
    if !rule_warnings.is_empty() {
        unavailable_types.insert("listener_rule".to_owned());
    }
    warnings.extend(rule_warnings);

    let mut graph = build_graph(Inventory {
        vpcs,
        subnets,
        instances,
        security_groups,
        rds_instances,
        internet_gateways,
        nat_gateways,
        route_tables,
        vpc_endpoints,
        vpc_peering_connections,
        egress_only_internet_gateways,
        transit_gateways,
        transit_gateway_attachments,
        transit_gateway_route_tables,
        transit_gateway_routes,
        load_balancers,
        listeners,
        listener_rules,
        target_groups,
        target_health,
    });
    graph.warnings = warnings;
    graph.regions = vec![region.to_owned()];
    graph.coverage = vec![RegionCoverage {
        region: region.to_owned(),
        unavailable_types: unavailable_types.into_iter().collect(),
        incomplete_edges: !graph.warnings.is_empty(),
        failed: false,
    }];
    progress("topology built");
    Ok(graph)
}

pub(crate) fn merge_region_graphs(
    regions: Vec<String>,
    found: Vec<(String, Graph)>,
    failed: Vec<(String, String)>,
) -> Graph {
    let multi_region = regions.len() > 1;
    let mut merged = Graph {
        nodes: Vec::new(),
        edges: Vec::new(),
        warnings: Vec::new(),
        regions,
        coverage: Vec::new(),
    };
    for (region, mut graph) in found {
        if multi_region {
            for node in &mut graph.nodes {
                node.data.id = format!("{region}::{}", node.data.id);
                node.data.region = Some(region.clone());
            }
            for edge in &mut graph.edges {
                edge.data.id = format!("{region}::{}", edge.data.id);
                edge.data.source = format!("{region}::{}", edge.data.source);
                edge.data.target = format!("{region}::{}", edge.data.target);
            }
        }
        merged.nodes.extend(graph.nodes);
        merged.edges.extend(graph.edges);
        merged
            .warnings
            .extend(graph.warnings.into_iter().map(|warning| {
                if multi_region {
                    format!("{region}: {warning}")
                } else {
                    warning
                }
            }));
        merged.coverage.extend(graph.coverage);
    }
    for (region, error) in failed {
        merged
            .warnings
            .push(format!("{region}: scan unavailable. {error}"));
        merged.coverage.push(RegionCoverage {
            region,
            unavailable_types: vec!["*".to_owned()],
            incomplete_edges: true,
            failed: true,
        });
    }
    merged.coverage.sort_by(|a, b| a.region.cmp(&b.region));
    if multi_region {
        add_cross_region_peering_edges(&mut merged);
    }
    merged
}

fn add_cross_region_peering_edges(graph: &mut Graph) {
    let mut vpcs = BTreeMap::<(String, String), String>::new();
    let mut vpcs_by_id = BTreeMap::<String, Vec<String>>::new();
    for node in &graph.nodes {
        if node.data.resource_type != "vpc" {
            continue;
        }
        let Some((region, local_id)) = node.data.id.split_once("::") else {
            continue;
        };
        let Some(vpc_id) = local_id.strip_prefix("vpc-") else {
            continue;
        };
        vpcs.insert((region.to_owned(), vpc_id.to_owned()), node.data.id.clone());
        vpcs_by_id
            .entry(vpc_id.to_owned())
            .or_default()
            .push(node.data.id.clone());
    }

    let mut existing_edges: BTreeSet<String> = graph
        .edges
        .iter()
        .map(|edge| edge.data.id.clone())
        .collect();
    for node in &graph.nodes {
        if node.data.resource_type != "vpc_peering" {
            continue;
        }
        let Some((region, local_id)) = node.data.id.split_once("::") else {
            continue;
        };
        let Some(connection_id) = local_id.strip_prefix("vpc_peering-") else {
            continue;
        };
        for (side, label) in [
            ("Requester", "requests VPC peering"),
            ("Accepter", "accepted by VPC"),
        ] {
            let Some(vpc_id) = node.data.details.get(&format!("{side} VPC")) else {
                continue;
            };
            let vpc_node = match node.data.details.get(&format!("{side} Region")) {
                Some(vpc_region) => vpcs.get(&(vpc_region.clone(), vpc_id.clone())),
                None => vpcs_by_id
                    .get(vpc_id)
                    .and_then(|matches| (matches.len() == 1).then(|| &matches[0])),
            };
            let Some(vpc_node) = vpc_node else {
                continue;
            };
            let id = if side == "Requester" {
                format!("{region}::edge-vpc-peering-requester-{vpc_id}-{connection_id}")
            } else {
                format!("{region}::edge-vpc-peering-accepter-{connection_id}-{vpc_id}")
            };
            if !existing_edges.insert(id.clone()) {
                continue;
            }
            let (source, target) = if side == "Requester" {
                (vpc_node.clone(), node.data.id.clone())
            } else {
                (node.data.id.clone(), vpc_node.clone())
            };
            graph.edges.push(Edge {
                data: EdgeData {
                    id,
                    source,
                    target,
                    label: label.to_owned(),
                },
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_ec2::types::{
        EgressOnlyInternetGateway, GroupIdentifier, InternetGatewayAttachment, Route,
        RouteTableAssociation, TransitGatewayAttachmentResourceType, TransitGatewayRouteAttachment,
        VpcEndpointType, VpcPeeringConnectionVpcInfo,
    };
    use aws_sdk_elasticloadbalancingv2::types::{
        AvailabilityZone, ForwardActionConfig, ProtocolEnum, TargetDescription, TargetGroupTuple,
        TargetHealth, TargetHealthReasonEnum, TargetHealthStateEnum,
    };

    #[test]
    fn merging_regions_namespaces_ids_and_marks_failed_regions() {
        let make_graph = |region: &str| {
            let mut builder = GraphBuilder::default();
            builder.add_node("vpc-same", "network", "vpc", BTreeMap::new());
            builder.add_node("subnet-same", "subnet", "subnet", BTreeMap::new());
            builder.add_edge("edge-same", "vpc-same", "subnet-same", "contains");
            let mut graph = builder.finish();
            graph.coverage.push(RegionCoverage {
                region: region.to_owned(),
                ..Default::default()
            });
            graph
        };
        let merged = merge_region_graphs(
            vec!["us-east-1".into(), "us-west-2".into(), "eu-west-1".into()],
            vec![
                ("us-east-1".into(), make_graph("us-east-1")),
                ("us-west-2".into(), make_graph("us-west-2")),
            ],
            vec![("eu-west-1".into(), "AccessDenied".into())],
        );
        assert_eq!(merged.nodes.len(), 4);
        assert_eq!(merged.edges.len(), 2);
        assert!(merged
            .nodes
            .iter()
            .any(|node| node.data.id == "us-east-1::vpc-same"
                && node.data.region.as_deref() == Some("us-east-1")));
        assert!(merged
            .edges
            .iter()
            .any(|edge| edge.data.source == "us-west-2::vpc-same"
                && edge.data.target == "us-west-2::subnet-same"));
        assert!(merged
            .coverage
            .iter()
            .any(|coverage| coverage.region == "eu-west-1" && coverage.failed));
    }

    #[test]
    fn merging_regions_restores_peering_link_to_remote_vpc() {
        let mut east = GraphBuilder::default();
        east.add_node("vpc-east", "East VPC", "vpc", BTreeMap::new());
        east.add_node("vpc-west", "Same ID in East", "vpc", BTreeMap::new());
        east.add_node(
            "vpc_peering-pcx-1",
            "pcx-1",
            "vpc_peering",
            BTreeMap::from([
                ("Requester VPC".to_owned(), "east".to_owned()),
                ("Requester Region".to_owned(), "us-east-1".to_owned()),
                ("Accepter VPC".to_owned(), "west".to_owned()),
                ("Accepter Region".to_owned(), "us-west-2".to_owned()),
            ]),
        );
        east.add_edge(
            "edge-local",
            "vpc-east",
            "vpc_peering-pcx-1",
            "requests VPC peering",
        );
        let mut west = GraphBuilder::default();
        west.add_node("vpc-west", "West VPC", "vpc", BTreeMap::new());
        let merged = merge_region_graphs(
            vec!["us-east-1".into(), "us-west-2".into()],
            vec![
                ("us-east-1".into(), east.finish()),
                ("us-west-2".into(), west.finish()),
            ],
            Vec::new(),
        );
        assert!(merged.edges.iter().any(|edge| {
            edge.data.source == "us-east-1::vpc_peering-pcx-1"
                && edge.data.target == "us-west-2::vpc-west"
                && edge.data.label == "accepted by VPC"
        }));
        assert!(!merged.edges.iter().any(|edge| {
            edge.data.source == "us-east-1::vpc_peering-pcx-1"
                && edge.data.target == "us-east-1::vpc-west"
        }));
    }

    #[test]
    fn inventory_failures_mark_dependent_resource_types_unavailable() {
        let mut failures = [false; 16];
        failures[3] = true;
        failures[14] = true;
        let unavailable = unavailable_inventory_types(&failures);
        assert!(unavailable.contains("sg"));
        assert!(unavailable.contains("alb"));
        assert!(unavailable.contains("listener_rule"));
        assert!(!unavailable.contains("vpc"));
    }
    use std::{cell::RefCell, collections::VecDeque, future::ready};

    fn named_tag(name: &str) -> Tag {
        Tag::builder().key("Name").value(name).build()
    }

    #[tokio::test]
    async fn pagination_advances_tokens_and_collects_every_page() {
        let seen = RefCell::new(Vec::new());
        let pages = RefCell::new(VecDeque::from([
            Ok((vec![1, 2], Some("page-2".to_owned()))),
            Ok((vec![3], Some("page-3".to_owned()))),
            Ok((vec![4, 5], None)),
        ]));

        let resources = paginate(|token| {
            seen.borrow_mut().push(token);
            ready(pages.borrow_mut().pop_front().expect("test page"))
        })
        .await
        .expect("pagination should succeed");

        assert_eq!(resources, vec![1, 2, 3, 4, 5]);
        assert_eq!(
            seen.into_inner(),
            vec![None, Some("page-2".to_owned()), Some("page-3".to_owned())]
        );
    }

    #[tokio::test]
    async fn pagination_rejects_repeated_tokens() {
        let pages = RefCell::new(VecDeque::from([
            Ok((vec![1], Some("same-token".to_owned()))),
            Ok((vec![2], Some("same-token".to_owned()))),
        ]));

        let error = paginate(|_| ready(pages.borrow_mut().pop_front().expect("test page")))
            .await
            .expect_err("repeated tokens must stop pagination");

        assert!(error.contains("repeated pagination token"));
    }

    #[test]
    fn inventory_failures_add_warnings_without_discarding_successful_inventory() {
        let mut warnings = vec!["Earlier inventory warning".to_owned()];

        let vpcs = retain_inventory("VPC", Ok(vec!["vpc-1"]), &mut warnings);
        let subnets: Vec<&str> = retain_inventory(
            "subnet",
            Err("could not list subnets: AccessDenied".to_owned()),
            &mut warnings,
        );
        let instances = retain_inventory("EC2 instance", Ok(vec!["i-1"]), &mut warnings);

        assert_eq!(vpcs, vec!["vpc-1"]);
        assert!(subnets.is_empty());
        assert_eq!(instances, vec!["i-1"]);
        assert_eq!(warnings.len(), 2);
        assert!(warnings[1].contains("subnet inventory is unavailable"));
        assert!(warnings[1].contains("AccessDenied"));
    }

    #[test]
    fn successful_inventory_does_not_create_warnings() {
        let mut warnings = Vec::new();
        let inventory = retain_inventory("VPC", Ok::<_, String>(vec![1, 2]), &mut warnings);

        assert_eq!(inventory, vec![1, 2]);
        assert!(warnings.is_empty());
    }

    #[test]
    fn all_inventory_failures_are_an_error_but_partial_failure_is_allowed() {
        let error = require_inventory_success(&[true, true, true], "AccessDenied")
            .expect_err("an entirely unreadable account is not an empty topology");
        assert!(error.contains("All 3 AWS inventory requests failed"));
        assert!(error.contains("AccessDenied"));
        assert!(require_inventory_success(&[true, false, true], "AccessDenied").is_ok());
        assert!(require_inventory_success(&[false, false], "").is_ok());
    }

    #[test]
    fn graph_builder_deduplicates_and_rejects_dangling_edges() {
        let mut builder = GraphBuilder::default();
        builder.add_node("vpc-vpc-1", "first", "vpc", BTreeMap::new());
        builder.add_node("vpc-vpc-1", "duplicate", "vpc", BTreeMap::new());
        builder.add_node("subnet-subnet-1", "subnet", "subnet", BTreeMap::new());
        builder.add_edge(
            "edge-vpc-subnet",
            "vpc-vpc-1",
            "subnet-subnet-1",
            "contains subnet",
        );
        builder.add_edge(
            "edge-vpc-subnet",
            "vpc-vpc-1",
            "subnet-subnet-1",
            "duplicate",
        );
        builder.add_edge(
            "edge-dangling",
            "vpc-vpc-1",
            "subnet-does-not-exist",
            "invalid",
        );

        let graph = builder.finish();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.nodes[1].data.label, "first");
    }

    #[test]
    fn topology_models_network_path_relationships_without_dangling_edges() {
        let inventory = Inventory {
            vpcs: vec![
                Vpc::builder()
                    .vpc_id("vpc-1")
                    .cidr_block("10.0.0.0/16")
                    .tags(named_tag("production"))
                    .build(),
                Vpc::builder().vpc_id("vpc-1").build(),
            ],
            subnets: vec![
                Subnet::builder()
                    .subnet_id("subnet-a")
                    .vpc_id("vpc-1")
                    .availability_zone("us-east-1a")
                    .build(),
                Subnet::builder()
                    .subnet_id("subnet-b")
                    .vpc_id("vpc-1")
                    .availability_zone("us-east-1b")
                    .build(),
            ],
            instances: vec![Instance::builder()
                .instance_id("i-1")
                .subnet_id("subnet-a")
                .security_groups(GroupIdentifier::builder().group_id("sg-1").build())
                .build()],
            security_groups: vec![SecurityGroup::builder()
                .group_id("sg-1")
                .group_name("web")
                .vpc_id("vpc-1")
                .build()],
            internet_gateways: vec![InternetGateway::builder()
                .internet_gateway_id("igw-1")
                .attachments(InternetGatewayAttachment::builder().vpc_id("vpc-1").build())
                .build()],
            nat_gateways: vec![NatGateway::builder()
                .nat_gateway_id("nat-1")
                .vpc_id("vpc-1")
                .subnet_id("subnet-a")
                .build()],
            route_tables: vec![RouteTable::builder()
                .route_table_id("rtb-main")
                .vpc_id("vpc-1")
                .associations(RouteTableAssociation::builder().main(true).build())
                .routes(
                    Route::builder()
                        .destination_cidr_block("0.0.0.0/0")
                        .gateway_id("igw-1")
                        .build(),
                )
                .routes(
                    Route::builder()
                        .destination_cidr_block("10.10.0.0/16")
                        .nat_gateway_id("nat-1")
                        .build(),
                )
                .build()],
            load_balancers: vec![LoadBalancer::builder()
                .load_balancer_arn(
                    "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/web/1",
                )
                .load_balancer_name("web")
                .vpc_id("vpc-1")
                .r#type(LoadBalancerTypeEnum::Application)
                .availability_zones(
                    AvailabilityZone::builder()
                        .zone_name("us-east-1a")
                        .subnet_id("subnet-a")
                        .build(),
                )
                .security_groups("sg-1")
                .build()],
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.data.id.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(
            node_ids
                .iter()
                .filter(|node_id| **node_id == "vpc-vpc-1")
                .count(),
            1
        );
        assert!(node_ids.contains("igw-igw-1"));
        assert!(node_ids.contains("nat-nat-1"));
        assert!(node_ids.contains("route_table-rtb-main"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.data.resource_type == "alb"));

        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.data.label == "attached internet gateway"));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.data.label == "routes 0.0.0.0/0 to target"));
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.data.label == "effective main route table")
                .count(),
            2
        );
        assert!(graph.edges.iter().all(|edge| {
            node_ids.contains(edge.data.source.as_str())
                && node_ids.contains(edge.data.target.as_str())
        }));
    }

    #[test]
    fn explicit_route_table_association_overrides_main_for_that_subnet() {
        let inventory = Inventory {
            vpcs: vec![Vpc::builder().vpc_id("vpc-1").build()],
            subnets: vec![Subnet::builder()
                .subnet_id("subnet-a")
                .vpc_id("vpc-1")
                .build()],
            route_tables: vec![
                RouteTable::builder()
                    .route_table_id("rtb-main")
                    .vpc_id("vpc-1")
                    .associations(RouteTableAssociation::builder().main(true).build())
                    .build(),
                RouteTable::builder()
                    .route_table_id("rtb-explicit")
                    .vpc_id("vpc-1")
                    .associations(
                        RouteTableAssociation::builder()
                            .subnet_id("subnet-a")
                            .build(),
                    )
                    .build(),
            ],
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == "route_table-rtb-explicit"
                && edge.data.target == "subnet-subnet-a"
                && edge.data.label == "explicit route table association"
        }));
        assert!(!graph.edges.iter().any(|edge| {
            edge.data.source == "route_table-rtb-main"
                && edge.data.target == "subnet-subnet-a"
                && edge.data.label == "effective main route table"
        }));
    }

    #[test]
    fn route_targets_link_only_discovered_extended_network_resources() {
        let inventory = Inventory {
            vpcs: vec![
                Vpc::builder().vpc_id("vpc-1").build(),
                Vpc::builder().vpc_id("vpc-2").build(),
            ],
            subnets: vec![Subnet::builder()
                .subnet_id("subnet-1")
                .vpc_id("vpc-1")
                .build()],
            route_tables: vec![RouteTable::builder()
                .route_table_id("rtb-1")
                .vpc_id("vpc-1")
                .routes(
                    Route::builder()
                        .destination_prefix_list_id("pl-s3")
                        .gateway_id("vpce-1")
                        .build(),
                )
                .routes(
                    Route::builder()
                        .destination_ipv6_cidr_block("::/0")
                        .egress_only_internet_gateway_id("eigw-1")
                        .build(),
                )
                .routes(
                    Route::builder()
                        .destination_cidr_block("10.1.0.0/16")
                        .vpc_peering_connection_id("pcx-1")
                        .build(),
                )
                .routes(
                    Route::builder()
                        .destination_cidr_block("10.2.0.0/16")
                        .transit_gateway_id("tgw-1")
                        .build(),
                )
                .routes(
                    Route::builder()
                        .destination_cidr_block("10.99.0.0/16")
                        .vpc_peering_connection_id("pcx-undiscovered")
                        .build(),
                )
                .build()],
            vpc_endpoints: vec![VpcEndpoint::builder()
                .vpc_endpoint_id("vpce-1")
                .vpc_id("vpc-1")
                .vpc_endpoint_type(VpcEndpointType::Gateway)
                .service_name("com.amazonaws.us-east-1.s3")
                .route_table_ids("rtb-1")
                .build()],
            vpc_peering_connections: vec![VpcPeeringConnection::builder()
                .vpc_peering_connection_id("pcx-1")
                .requester_vpc_info(
                    VpcPeeringConnectionVpcInfo::builder()
                        .vpc_id("vpc-1")
                        .region("us-east-1")
                        .build(),
                )
                .accepter_vpc_info(
                    VpcPeeringConnectionVpcInfo::builder()
                        .vpc_id("vpc-2")
                        .region("us-west-2")
                        .build(),
                )
                .build()],
            egress_only_internet_gateways: vec![EgressOnlyInternetGateway::builder()
                .egress_only_internet_gateway_id("eigw-1")
                .attachments(InternetGatewayAttachment::builder().vpc_id("vpc-1").build())
                .build()],
            transit_gateways: vec![TransitGateway::builder()
                .transit_gateway_id("tgw-1")
                .build()],
            transit_gateway_attachments: vec![TransitGatewayAttachment::builder()
                .transit_gateway_attachment_id("tgw-attach-1")
                .transit_gateway_id("tgw-1")
                .resource_type(TransitGatewayAttachmentResourceType::Vpc)
                .resource_id("vpc-2")
                .build()],
            transit_gateway_route_tables: vec![TransitGatewayRouteTable::builder()
                .transit_gateway_route_table_id("tgw-rtb-1")
                .transit_gateway_id("tgw-1")
                .build()],
            transit_gateway_routes: BTreeMap::from([(
                "tgw-rtb-1".to_owned(),
                vec![
                    TransitGatewayRoute::builder()
                        .destination_cidr_block("10.2.0.0/16")
                        .transit_gateway_attachments(
                            TransitGatewayRouteAttachment::builder()
                                .transit_gateway_attachment_id("tgw-attach-1")
                                .build(),
                        )
                        .build(),
                    TransitGatewayRoute::builder()
                        .destination_cidr_block("10.3.0.0/16")
                        .transit_gateway_attachments(
                            TransitGatewayRouteAttachment::builder()
                                .transit_gateway_attachment_id("tgw-attach-undiscovered")
                                .build(),
                        )
                        .build(),
                ],
            )]),
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        let peering = graph
            .nodes
            .iter()
            .find(|node| node.data.id == "vpc_peering-pcx-1")
            .unwrap();
        assert_eq!(
            peering
                .data
                .details
                .get("Requester Region")
                .map(String::as_str),
            Some("us-east-1")
        );
        assert_eq!(
            peering
                .data
                .details
                .get("Accepter Region")
                .map(String::as_str),
            Some("us-west-2")
        );
        let node_ids = graph
            .nodes
            .iter()
            .map(|node| node.data.id.as_str())
            .collect::<BTreeSet<_>>();

        for expected in [
            "vpc_endpoint-vpce-1",
            "vpc_peering-pcx-1",
            "egress_only_igw-eigw-1",
            "transit_gateway-tgw-1",
            "transit_gateway_attachment-tgw-attach-1",
            "transit_gateway_route_table-tgw-rtb-1",
        ] {
            assert!(node_ids.contains(expected), "missing node {expected}");
        }
        for (source, target, label) in [
            (
                "route_table-rtb-1",
                "vpc_endpoint-vpce-1",
                "routes pl-s3 to target",
            ),
            (
                "route_table-rtb-1",
                "egress_only_igw-eigw-1",
                "routes ::/0 to target",
            ),
            (
                "route_table-rtb-1",
                "vpc_peering-pcx-1",
                "routes 10.1.0.0/16 to target",
            ),
            (
                "route_table-rtb-1",
                "transit_gateway-tgw-1",
                "routes 10.2.0.0/16 to target",
            ),
            (
                "transit_gateway-tgw-1",
                "transit_gateway_attachment-tgw-attach-1",
                "has transit gateway attachment",
            ),
            (
                "transit_gateway_attachment-tgw-attach-1",
                "vpc-vpc-2",
                "connects VPC attachment",
            ),
            (
                "transit_gateway_route_table-tgw-rtb-1",
                "transit_gateway_attachment-tgw-attach-1",
                "routes 10.2.0.0/16 to attachment",
            ),
        ] {
            assert!(
                graph.edges.iter().any(|edge| {
                    edge.data.source == source
                        && edge.data.target == target
                        && edge.data.label == label
                }),
                "missing edge {source} -> {target}: {label}"
            );
        }
        assert!(graph.edges.iter().all(|edge| {
            node_ids.contains(edge.data.source.as_str())
                && node_ids.contains(edge.data.target.as_str())
        }));
        assert!(graph.edges.iter().all(|edge| {
            edge.data.target != "vpc_peering-pcx-undiscovered"
                && edge.data.target != "transit_gateway_attachment-tgw-attach-undiscovered"
        }));
    }

    #[test]
    fn load_balancers_route_through_target_groups_to_registered_ec2_targets() {
        let alb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/web/one";
        let nlb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/net/internal/two";
        let alb_listener_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:listener/app/web/one/https";
        let nlb_listener_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:listener/net/internal/two/tcp";
        let alb_target_group_arn = "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/web/one";
        let nlb_target_group_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/internal/two";

        let inventory = Inventory {
            instances: vec![
                Instance::builder().instance_id("i-web").build(),
                Instance::builder().instance_id("i-internal").build(),
            ],
            load_balancers: vec![
                LoadBalancer::builder()
                    .load_balancer_arn(alb_arn)
                    .r#type(LoadBalancerTypeEnum::Application)
                    .build(),
                LoadBalancer::builder()
                    .load_balancer_arn(nlb_arn)
                    .r#type(LoadBalancerTypeEnum::Network)
                    .build(),
            ],
            listeners: vec![
                Listener::builder()
                    .listener_arn(alb_listener_arn)
                    .load_balancer_arn(alb_arn)
                    .protocol(ProtocolEnum::Https)
                    .port(443)
                    .default_actions(
                        Action::builder()
                            .r#type(ActionTypeEnum::Forward)
                            .target_group_arn(alb_target_group_arn)
                            .build(),
                    )
                    .build(),
                Listener::builder()
                    .listener_arn(nlb_listener_arn)
                    .load_balancer_arn(nlb_arn)
                    .protocol(ProtocolEnum::Tcp)
                    .port(80)
                    .default_actions(
                        Action::builder()
                            .r#type(ActionTypeEnum::Forward)
                            .target_group_arn(nlb_target_group_arn)
                            .build(),
                    )
                    .build(),
            ],
            target_groups: vec![
                TargetGroup::builder()
                    .target_group_arn(alb_target_group_arn)
                    .load_balancer_arns(alb_arn)
                    .target_type(TargetTypeEnum::Instance)
                    .build(),
                TargetGroup::builder()
                    .target_group_arn(nlb_target_group_arn)
                    .load_balancer_arns(nlb_arn)
                    .target_type(TargetTypeEnum::Instance)
                    .build(),
            ],
            target_health: BTreeMap::from([
                (
                    alb_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(TargetDescription::builder().id("i-web").build())
                        .build()],
                ),
                (
                    nlb_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(TargetDescription::builder().id("i-internal").build())
                        .build()],
                ),
            ]),
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        let alb_target_group = target_group_node_id(alb_target_group_arn);
        let nlb_target_group = target_group_node_id(nlb_target_group_arn);
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.data.id == alb_target_group));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.data.id == nlb_target_group));
        for (load_balancer, listener, target_group) in [
            (format!("alb-{alb_arn}"), alb_listener_arn, alb_target_group),
            (format!("nlb-{nlb_arn}"), nlb_listener_arn, nlb_target_group),
        ] {
            assert!(graph.edges.iter().any(|edge| {
                edge.data.source == load_balancer && edge.data.target == listener_node_id(listener)
            }));
            assert!(graph.edges.iter().any(|edge| {
                edge.data.source == listener_node_id(listener)
                    && edge.data.target == default_rule_node_id(listener)
            }));
            assert!(graph.edges.iter().any(|edge| {
                edge.data.source == default_rule_node_id(listener)
                    && edge.data.target == target_group
                    && edge.data.label == "forwards to target group"
            }));
            assert!(!graph.edges.iter().any(|edge| {
                edge.data.source == load_balancer && edge.data.target == target_group
            }));
        }
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == target_group_node_id(alb_target_group_arn)
                && edge.data.label == "registered EC2 target"
                && edge.data.target.starts_with("target_ec2-")
        }));
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == target_group_node_id(nlb_target_group_arn)
                && edge.data.label == "registered EC2 target"
                && edge.data.target.starts_with("target_ec2-")
        }));
    }

    #[test]
    fn conditional_weighted_rules_only_link_their_forwarded_target_groups() {
        let alb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/web/one";
        let listener_arn = "arn:aws:elasticloadbalancing:us-east-1:123:listener/app/web/one/https";
        let rule_arn = "arn:aws:elasticloadbalancing:us-east-1:123:listener-rule/app/web/one/api";
        let first_group = "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/api-blue/one";
        let second_group = "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/api-green/two";
        let disabled_group =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/api-disabled/four";
        let attached_but_unused =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/unused/three";
        let weighted_forward = Action::builder()
            .r#type(ActionTypeEnum::Forward)
            .forward_config(
                ForwardActionConfig::builder()
                    .target_groups(
                        TargetGroupTuple::builder()
                            .target_group_arn(first_group)
                            .weight(80)
                            .build(),
                    )
                    .target_groups(
                        TargetGroupTuple::builder()
                            .target_group_arn(second_group)
                            .weight(20)
                            .build(),
                    )
                    .target_groups(
                        TargetGroupTuple::builder()
                            .target_group_arn(disabled_group)
                            .weight(0)
                            .build(),
                    )
                    .build(),
            )
            .build();
        let inventory = Inventory {
            load_balancers: vec![LoadBalancer::builder()
                .load_balancer_arn(alb_arn)
                .r#type(LoadBalancerTypeEnum::Application)
                .build()],
            listeners: vec![Listener::builder()
                .listener_arn(listener_arn)
                .load_balancer_arn(alb_arn)
                .default_actions(Action::builder().r#type(ActionTypeEnum::Redirect).build())
                .build()],
            listener_rules: BTreeMap::from([(
                listener_arn.to_owned(),
                vec![
                    Rule::builder()
                        .rule_arn(rule_arn)
                        .priority("10")
                        .conditions(
                            RuleCondition::builder()
                                .field("path-pattern")
                                .values("/api/*")
                                .build(),
                        )
                        .actions(weighted_forward)
                        .build(),
                    Rule::builder()
                        .rule_arn("default-rule-from-aws")
                        .is_default(true)
                        .build(),
                ],
            )]),
            target_groups: [
                first_group,
                second_group,
                disabled_group,
                attached_but_unused,
            ]
            .into_iter()
            .map(|arn| {
                TargetGroup::builder()
                    .target_group_arn(arn)
                    .load_balancer_arns(alb_arn)
                    .build()
            })
            .collect(),
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        let rule_node = listener_rule_node_id(rule_arn);
        let rule = graph
            .nodes
            .iter()
            .find(|node| node.data.id == rule_node)
            .expect("custom rule");
        assert_eq!(
            rule.data.details.get("Conditions"),
            Some(&"path-pattern: /api/*".to_owned())
        );
        assert_eq!(
            rule.data.details.get("Actions"),
            Some(&"forward".to_owned())
        );
        assert!(!graph
            .nodes
            .iter()
            .any(|node| node.data.id == listener_rule_node_id("default-rule-from-aws")));
        for (group, weight) in [(first_group, 80), (second_group, 20)] {
            assert!(graph.edges.iter().any(|edge| {
                edge.data.source == rule_node
                    && edge.data.target == target_group_node_id(group)
                    && edge.data.label == format!("forwards to target group (weight {weight})")
            }));
        }
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == rule_node
                && edge.data.target == target_group_node_id(disabled_group)
                && edge.data.label == "configured target group (weight 0; no traffic)"
        }));
        assert!(!graph
            .edges
            .iter()
            .any(|edge| edge.data.target == target_group_node_id(attached_but_unused)));
        assert!(!graph.edges.iter().any(|edge| edge.data.source
            == default_rule_node_id(listener_arn)
            && edge.data.target.starts_with("target_group-")));
    }

    #[test]
    fn target_groups_render_every_registration_type_without_depending_on_other_inventory() {
        let alb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/web/one";
        let ip_target_group_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/ip-targets/one";
        let lambda_target_group_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/lambda-targets/two";
        let alb_target_group_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/alb-targets/three";
        let instance_target_group_arn =
            "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/instances/four";

        let inventory = Inventory {
            instances: vec![Instance::builder().instance_id("i-known").build()],
            load_balancers: vec![LoadBalancer::builder()
                .load_balancer_arn(alb_arn)
                .r#type(LoadBalancerTypeEnum::Application)
                .build()],
            target_groups: vec![
                TargetGroup::builder()
                    .target_group_arn(ip_target_group_arn)
                    .load_balancer_arns(alb_arn)
                    .target_type(TargetTypeEnum::Ip)
                    .protocol(ProtocolEnum::Http)
                    .port(8080)
                    .build(),
                TargetGroup::builder()
                    .target_group_arn(lambda_target_group_arn)
                    .load_balancer_arns(alb_arn)
                    .target_type(TargetTypeEnum::Lambda)
                    .build(),
                TargetGroup::builder()
                    .target_group_arn(alb_target_group_arn)
                    .load_balancer_arns(alb_arn)
                    .target_type(TargetTypeEnum::Alb)
                    .protocol(ProtocolEnum::Http)
                    .port(443)
                    .build(),
                TargetGroup::builder()
                    .target_group_arn(instance_target_group_arn)
                    .load_balancer_arns(alb_arn)
                    .target_type(TargetTypeEnum::Instance)
                    .build(),
            ],
            target_health: BTreeMap::from([
                (
                    ip_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(
                            TargetDescription::builder()
                                .id("10.0.0.10")
                                .port(8081)
                                .availability_zone("us-east-1a")
                                .build(),
                        )
                        .health_check_port("traffic-port")
                        .target_health(
                            TargetHealth::builder()
                                .state(TargetHealthStateEnum::Unhealthy)
                                .reason(TargetHealthReasonEnum::ResponseCodeMismatch)
                                .description("received 503")
                                .build(),
                        )
                        .build()],
                ),
                (
                    lambda_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(
                            TargetDescription::builder()
                                .id("arn:aws:lambda:us-east-1:123:function:worker")
                                .build(),
                        )
                        .build()],
                ),
                (
                    alb_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(TargetDescription::builder().id(alb_arn).build())
                        .build()],
                ),
                (
                    instance_target_group_arn.to_owned(),
                    vec![TargetHealthDescription::builder()
                        .target(
                            TargetDescription::builder()
                                .id("i-not-in-inventory")
                                .build(),
                        )
                        .build()],
                ),
            ]),
            ..Inventory::default()
        };

        let graph = build_graph(inventory);
        for (resource_type, target_type, target_id, target_kind) in [
            ("target_ip", "ip", "10.0.0.10", "IP"),
            (
                "target_lambda",
                "lambda",
                "arn:aws:lambda:us-east-1:123:function:worker",
                "Lambda",
            ),
            ("target_alb", "alb", alb_arn, "Application Load Balancer"),
            ("target_ec2", "instance", "i-not-in-inventory", "EC2"),
        ] {
            let target = graph
                .nodes
                .iter()
                .find(|node| {
                    node.data.resource_type == resource_type && node.data.label == target_id
                })
                .unwrap_or_else(|| panic!("missing {target_kind} registration"));
            assert_eq!(target.data.details.get("Target type").unwrap(), target_type);
            assert!(graph.edges.iter().any(|edge| {
                edge.data.target == target.data.id
                    && edge
                        .data
                        .label
                        .starts_with(&format!("registered {target_kind} target"))
            }));
        }
        let ip_target = graph
            .nodes
            .iter()
            .find(|node| node.data.resource_type == "target_ip")
            .expect("IP registration node");
        assert_eq!(
            ip_target.data.details.get("Protocol"),
            Some(&"HTTP".to_owned())
        );
        assert_eq!(
            ip_target.data.details.get("Target port"),
            Some(&"8081".to_owned())
        );
        assert_eq!(
            ip_target.data.details.get("Health state"),
            Some(&"unhealthy".to_owned())
        );
        assert_eq!(
            ip_target.data.details.get("Health reason"),
            Some(&"Target.ResponseCodeMismatch".to_owned())
        );
        assert!(graph.edges.iter().any(|edge| {
            edge.data.target == ip_target.data.id
                && edge.data.label
                    == "registered IP target (HTTP; 8081; unhealthy; Target.ResponseCodeMismatch)"
        }));
        assert!(graph.edges.iter().all(|edge| {
            graph
                .nodes
                .iter()
                .any(|node| node.data.id == edge.data.source)
                && graph
                    .nodes
                    .iter()
                    .any(|node| node.data.id == edge.data.target)
        }));
    }
}
