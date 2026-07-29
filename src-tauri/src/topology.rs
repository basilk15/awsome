use aws_config::{BehaviorVersion, Region};
use aws_sdk_ec2::{
    types::{Instance, InternetGateway, NatGateway, RouteTable, SecurityGroup, Subnet, Tag, Vpc},
    Client as Ec2Client,
};
use aws_sdk_elasticloadbalancingv2::{
    types::{
        LoadBalancer, LoadBalancerTypeEnum, TargetGroup, TargetHealthDescription, TargetTypeEnum,
    },
    Client as Elbv2Client,
};
use aws_sdk_rds::{types::DbInstance, Client as RdsClient};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
};

#[derive(Debug, Serialize)]
pub(crate) struct Graph {
    pub(crate) nodes: Vec<Node>,
    pub(crate) edges: Vec<Edge>,
}

#[derive(Debug, Serialize)]
pub(crate) struct Node {
    data: NodeData,
}

#[derive(Debug, Serialize)]
pub(crate) struct NodeData {
    id: String,
    label: String,
    #[serde(rename = "type")]
    resource_type: String,
    details: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct Edge {
    data: EdgeData,
}

#[derive(Debug, Serialize)]
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
    load_balancers: Vec<LoadBalancer>,
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
        }
    }
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

async fn list_target_health(
    client: &Elbv2Client,
    target_groups: &[TargetGroup],
) -> Result<BTreeMap<String, Vec<TargetHealthDescription>>, String> {
    const MAX_CONCURRENT_REQUESTS: usize = 8;

    let mut target_health = BTreeMap::new();
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
        let (target_group_arn, descriptions) = result
            .map_err(|error| format!("ELBv2 target-health inventory task failed: {error}"))??;
        target_health.insert(target_group_arn, descriptions);

        if let Some(target_group_arn) = target_group_arns.next() {
            spawn_target_health_request(&mut requests, client.clone(), target_group_arn);
        }
    }

    Ok(target_health)
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

    add_load_balancer_target_edges(graph, inventory);
}

fn add_load_balancer_target_edges(graph: &mut GraphBuilder, inventory: &Inventory) {
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
        if target_group.target_type() != Some(&TargetTypeEnum::Instance) {
            continue;
        }
        let Some(target_group_arn) = target_group.target_group_arn() else {
            continue;
        };
        let Some(targets) = inventory.target_health.get(target_group_arn) else {
            continue;
        };

        for load_balancer_arn in target_group.load_balancer_arns() {
            let Some(load_balancer_node) = load_balancer_nodes.get(load_balancer_arn.as_str())
            else {
                continue;
            };
            for instance_id in targets
                .iter()
                .filter_map(|description| description.target())
                .filter_map(|target| target.id())
            {
                graph.add_edge(
                    format!(
                        "edge-load-balancer-ec2-{load_balancer_node}-{target_group_arn}-{instance_id}"
                    ),
                    load_balancer_node.clone(),
                    format!("ec2-{instance_id}"),
                    "routes to registered EC2 target",
                );
            }
        }
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
                gateway_id
                    .starts_with("igw-")
                    .then(|| format!("igw-{gateway_id}"))
            } else if let Some(nat_gateway_id) = route.nat_gateway_id() {
                Some(format!("nat-{nat_gateway_id}"))
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

pub(crate) async fn fetch_topology(profile: String, region: String) -> Result<Graph, String> {
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

    let ec2 = Ec2Client::new(&sdk_config);
    let rds = RdsClient::new(&sdk_config);
    let elbv2 = Elbv2Client::new(&sdk_config);

    let (
        vpcs,
        subnets,
        instances,
        security_groups,
        rds_instances,
        internet_gateways,
        nat_gateways,
        route_tables,
        load_balancers,
        target_groups,
    ) = tokio::try_join!(
        list_vpcs(&ec2),
        list_subnets(&ec2),
        list_instances(&ec2),
        list_security_groups(&ec2),
        list_db_instances(&rds),
        list_internet_gateways(&ec2),
        list_nat_gateways(&ec2),
        list_route_tables(&ec2),
        list_load_balancers(&elbv2),
        list_target_groups(&elbv2),
    )
    .map_err(|error| format!("AWS inventory request failed: {error}"))?;

    let target_health = list_target_health(&elbv2, &target_groups)
        .await
        .map_err(|error| format!("AWS inventory request failed: {error}"))?;

    Ok(build_graph(Inventory {
        vpcs,
        subnets,
        instances,
        security_groups,
        rds_instances,
        internet_gateways,
        nat_gateways,
        route_tables,
        load_balancers,
        target_groups,
        target_health,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_ec2::types::{
        GroupIdentifier, InternetGatewayAttachment, Route, RouteTableAssociation,
    };
    use aws_sdk_elasticloadbalancingv2::types::{AvailabilityZone, TargetDescription};
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
    fn load_balancers_route_to_registered_ec2_instance_targets() {
        let alb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/web/one";
        let nlb_arn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/net/internal/two";
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
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == format!("alb-{alb_arn}")
                && edge.data.target == "ec2-i-web"
                && edge.data.label == "routes to registered EC2 target"
        }));
        assert!(graph.edges.iter().any(|edge| {
            edge.data.source == format!("nlb-{nlb_arn}")
                && edge.data.target == "ec2-i-internal"
                && edge.data.label == "routes to registered EC2 target"
        }));
    }

    #[test]
    fn unsupported_or_undiscovered_load_balancer_targets_do_not_create_edges() {
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
                        .target(TargetDescription::builder().id("10.0.0.10").build())
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
        assert!(graph
            .edges
            .iter()
            .all(|edge| edge.data.label != "routes to registered EC2 target"));
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
