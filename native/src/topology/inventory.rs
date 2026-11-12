use super::{
    load_balancer_resource_type, DbInstance, Ec2Client, EgressOnlyInternetGateway, Elbv2Client,
    Instance, InternetGateway, Listener, LoadBalancer, NatGateway, RdsClient, RouteTable, Rule,
    SecurityGroup, Subnet, TargetGroup, TargetHealthDescription, TransitGateway,
    TransitGatewayAttachment, TransitGatewayRoute, TransitGatewayRouteTable, Vpc, VpcEndpoint,
    VpcPeeringConnection,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
};

pub(super) async fn paginate<T, F, Fut>(mut fetch_page: F) -> Result<Vec<T>, String>
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

pub(super) async fn list_vpcs(client: &Ec2Client) -> Result<Vec<Vpc>, String> {
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

pub(super) async fn list_subnets(client: &Ec2Client) -> Result<Vec<Subnet>, String> {
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

pub(super) async fn list_instances(client: &Ec2Client) -> Result<Vec<Instance>, String> {
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

pub(super) async fn list_security_groups(client: &Ec2Client) -> Result<Vec<SecurityGroup>, String> {
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

pub(super) async fn list_internet_gateways(
    client: &Ec2Client,
) -> Result<Vec<InternetGateway>, String> {
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

pub(super) async fn list_nat_gateways(client: &Ec2Client) -> Result<Vec<NatGateway>, String> {
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

pub(super) async fn list_route_tables(client: &Ec2Client) -> Result<Vec<RouteTable>, String> {
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

pub(super) async fn list_vpc_endpoints(client: &Ec2Client) -> Result<Vec<VpcEndpoint>, String> {
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

pub(super) async fn list_vpc_peering_connections(
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

pub(super) async fn list_egress_only_internet_gateways(
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

pub(super) async fn list_transit_gateways(
    client: &Ec2Client,
) -> Result<Vec<TransitGateway>, String> {
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

pub(super) async fn list_transit_gateway_attachments(
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

pub(super) async fn list_transit_gateway_route_tables(
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

pub(super) async fn list_transit_gateway_routes(
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

pub(super) async fn list_db_instances(client: &RdsClient) -> Result<Vec<DbInstance>, String> {
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

pub(super) async fn list_load_balancers(client: &Elbv2Client) -> Result<Vec<LoadBalancer>, String> {
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

pub(super) async fn list_target_groups(client: &Elbv2Client) -> Result<Vec<TargetGroup>, String> {
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

pub(super) async fn list_listeners(
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

pub(super) async fn list_listener_rules(
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

pub(super) async fn list_target_health(
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
