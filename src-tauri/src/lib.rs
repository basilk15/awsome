use aws_config::{BehaviorVersion, Region};
use aws_sdk_ec2::{types::Vpc, Client as Ec2Client};
use aws_sdk_rds::{types::DbInstance, Client as RdsClient};
use serde::Serialize;

#[derive(Serialize)]
struct Graph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

#[derive(Serialize)]
struct Node {
    data: NodeData,
}

#[derive(Serialize)]
struct NodeData {
    id: String,
    label: String,
    #[serde(rename = "type")]
    resource_type: String,
}

#[derive(Serialize)]
struct Edge {
    data: EdgeData,
}

#[derive(Serialize)]
struct EdgeData {
    id: String,
    source: String,
    target: String,
    label: String,
}

fn name_tag(tags: &[aws_sdk_ec2::types::Tag]) -> Option<String> {
    tags.iter()
        .find(|tag| tag.key() == Some("Name"))
        .and_then(|tag| tag.value())
        .map(str::to_owned)
}

fn add_node(nodes: &mut Vec<Node>, id: String, label: String, resource_type: &str) {
    if nodes.iter().any(|node| node.data.id == id) {
        return;
    }

    nodes.push(Node {
        data: NodeData {
            id,
            label,
            resource_type: resource_type.to_owned(),
        },
    });
}

fn add_edge(edges: &mut Vec<Edge>, id: String, source: String, target: String, label: &str) {
    if edges.iter().any(|edge| edge.data.id == id) {
        return;
    }

    edges.push(Edge {
        data: EdgeData {
            id,
            source,
            target,
            label: label.to_owned(),
        },
    });
}

async fn list_vpcs(client: &Ec2Client) -> Result<Vec<Vpc>, String> {
    let mut resources = Vec::new();
    let mut next_token = None;

    loop {
        let page = client
            .describe_vpcs()
            .set_next_token(next_token.clone())
            .send()
            .await
            .map_err(|error| format!("could not list VPCs: {error}"))?;
        resources.extend(page.vpcs().iter().cloned());
        next_token = page.next_token().map(str::to_owned);
        if next_token.is_none() {
            return Ok(resources);
        }
    }
}

async fn list_db_instances(client: &RdsClient) -> Result<Vec<DbInstance>, String> {
    let mut resources = Vec::new();
    let mut marker = None;

    loop {
        let page = client
            .describe_db_instances()
            .set_marker(marker.clone())
            .send()
            .await
            .map_err(|error| format!("could not list RDS instances: {error}"))?;
        resources.extend(page.db_instances().iter().cloned());
        marker = page.marker().map(str::to_owned);
        if marker.is_none() {
            return Ok(resources);
        }
    }
}

#[tauri::command]
async fn fetch_topology(profile: String, region: String) -> Result<Graph, String> {
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

    let (vpcs, subnets_page, instances_page, security_groups_page, rds_instances) =
        tokio::try_join!(
            list_vpcs(&ec2),
            async {
                ec2.describe_subnets()
                    .send()
                    .await
                    .map_err(|error| format!("could not list subnets: {error}"))
            },
            async {
                ec2.describe_instances()
                    .send()
                    .await
                    .map_err(|error| format!("could not list EC2 instances: {error}"))
            },
            async {
                ec2.describe_security_groups()
                    .send()
                    .await
                    .map_err(|error| format!("could not list security groups: {error}"))
            },
            list_db_instances(&rds)
        )
        .map_err(|error| format!("AWS inventory request failed: {error}"))?;

    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    for vpc in vpcs {
        let Some(vpc_id) = vpc.vpc_id() else { continue };
        add_node(
            &mut nodes,
            format!("vpc-{vpc_id}"),
            name_tag(vpc.tags()).unwrap_or_else(|| vpc_id.to_owned()),
            "vpc",
        );
    }

    for subnet in subnets_page.subnets() {
        let Some(subnet_id) = subnet.subnet_id() else {
            continue;
        };
        let subnet_node = format!("subnet-{subnet_id}");
        add_node(
            &mut nodes,
            subnet_node.clone(),
            name_tag(subnet.tags()).unwrap_or_else(|| subnet_id.to_owned()),
            "subnet",
        );
        if let Some(vpc_id) = subnet.vpc_id() {
            add_edge(
                &mut edges,
                format!("edge-vpc-subnet-{vpc_id}-{subnet_id}"),
                format!("vpc-{vpc_id}"),
                subnet_node,
                "contains",
            );
        }
    }

    for reservation in instances_page.reservations() {
        for instance in reservation.instances() {
            let Some(instance_id) = instance.instance_id() else {
                continue;
            };
            let instance_node = format!("ec2-{instance_id}");
            add_node(
                &mut nodes,
                instance_node.clone(),
                name_tag(instance.tags()).unwrap_or_else(|| instance_id.to_owned()),
                "ec2",
            );
            if let Some(subnet_id) = instance.subnet_id() {
                add_edge(
                    &mut edges,
                    format!("edge-subnet-ec2-{subnet_id}-{instance_id}"),
                    format!("subnet-{subnet_id}"),
                    instance_node.clone(),
                    "hosts",
                );
            }
            for group in instance.security_groups() {
                if let Some(group_id) = group.group_id() {
                    add_edge(
                        &mut edges,
                        format!("edge-ec2-sg-{instance_id}-{group_id}"),
                        instance_node.clone(),
                        format!("sg-{group_id}"),
                        "secured-by",
                    );
                }
            }
        }
    }

    for security_group in security_groups_page.security_groups() {
        let Some(group_id) = security_group.group_id() else {
            continue;
        };
        let group_node = format!("sg-{group_id}");
        add_node(
            &mut nodes,
            group_node.clone(),
            security_group.group_name().unwrap_or(group_id).to_owned(),
            "sg",
        );
        if let Some(vpc_id) = security_group.vpc_id() {
            add_edge(
                &mut edges,
                format!("edge-vpc-sg-{vpc_id}-{group_id}"),
                format!("vpc-{vpc_id}"),
                group_node,
                "belongs-to",
            );
        }
    }

    for db_instance in rds_instances {
        let Some(identifier) = db_instance.db_instance_identifier() else {
            continue;
        };
        let rds_node = format!("rds-{identifier}");
        add_node(&mut nodes, rds_node.clone(), identifier.to_owned(), "rds");
        if let Some(subnet_group) = db_instance.db_subnet_group() {
            for subnet in subnet_group.subnets() {
                if let Some(subnet_id) = subnet.subnet_identifier() {
                    add_edge(
                        &mut edges,
                        format!("edge-subnet-rds-{subnet_id}-{identifier}"),
                        format!("subnet-{subnet_id}"),
                        rds_node.clone(),
                        "hosts",
                    );
                }
            }
        }
        for security_group in db_instance.vpc_security_groups() {
            if let Some(group_id) = security_group.vpc_security_group_id() {
                add_edge(
                    &mut edges,
                    format!("edge-rds-sg-{identifier}-{group_id}"),
                    rds_node.clone(),
                    format!("sg-{group_id}"),
                    "secured-by",
                );
            }
        }
    }

    Ok(Graph { nodes, edges })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_topology])
        .run(tauri::generate_context!())
        .expect("error while running Graphivo");
}
