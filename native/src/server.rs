use crate::{migration, snapshots, sources, topology, ScanState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    sync::mpsc,
};

#[derive(Deserialize)]
struct Request {
    id: u64,
    command: String,
    #[serde(default)]
    args: Value,
}

#[derive(Serialize)]
struct Response {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn required_string(args: &Value, name: &str) -> Result<String, String> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("Missing {name}"))
}

async fn dispatch(
    request: &Request,
    state: &ScanState,
    data_dir: PathBuf,
    legacy_dir: PathBuf,
    migration_report: &migration::MigrationReport,
) -> Result<Value, String> {
    let args = &request.args;
    match request.command.as_str() {
        "list_profiles" => Ok(json!(sources::list_profiles())),
        "list_regions" => Ok(json!(
            sources::list_regions(required_string(args, "profile")?).await?
        )),
        "fetch_topology" => {
            let regions = serde_json::from_value::<Vec<String>>(
                args.get("regions").cloned().ok_or("Missing regions")?,
            )
            .map_err(|error| error.to_string())?;
            Ok(json!(
                crate::fetch_topology(
                    required_string(args, "profile")?,
                    regions,
                    required_string(args, "requestId")?,
                    state
                )
                .await?
            ))
        }
        "get_scan_progress" => Ok(json!(crate::get_scan_progress(state))),
        "cancel_scan" => Ok(json!(crate::cancel_scan(
            required_string(args, "requestId")?,
            state
        ))),
        "save_snapshot" => {
            let graph = serde_json::from_value::<topology::Graph>(
                args.get("graph").cloned().ok_or("Missing graph")?,
            )
            .map_err(|error| error.to_string())?;
            Ok(json!(
                snapshots::save_snapshot(
                    data_dir,
                    required_string(args, "profile")?,
                    required_string(args, "region")?,
                    graph
                )
                .await?
            ))
        }
        "list_snapshots" => Ok(json!(snapshots::list_snapshots(data_dir).await?)),
        "load_snapshot" => Ok(json!(
            snapshots::load_snapshot(data_dir, required_string(args, "id")?).await?
        )),
        "delete_snapshot" => {
            snapshots::delete_snapshot(data_dir, required_string(args, "id")?).await?;
            Ok(Value::Null)
        }
        "preview_prune_snapshots" => {
            let keep = args
                .get("keepPerSource")
                .and_then(Value::as_u64)
                .ok_or("Missing keepPerSource")?;
            Ok(json!(
                snapshots::preview_prune_snapshots(
                    data_dir,
                    usize::try_from(keep).map_err(|error| error.to_string())?
                )
                .await?
            ))
        }
        "prune_snapshots" => {
            let keep = args
                .get("keepPerSource")
                .and_then(Value::as_u64)
                .ok_or("Missing keepPerSource")?;
            let expected =
                serde_json::from_value(args.get("expected").cloned().ok_or("Missing expected")?)
                    .map_err(|error| format!("Invalid expected scans: {error}"))?;
            Ok(json!(
                snapshots::prune_snapshots(
                    data_dir,
                    usize::try_from(keep).map_err(|error| error.to_string())?,
                    expected
                )
                .await?
            ))
        }
        "migration_status" => Ok(json!(migration_report)),
        "read_legacy_planning" => Ok(json!(tokio::task::spawn_blocking(move || {
            migration::read_legacy_planning(&legacy_dir)
        })
        .await
        .map_err(|error| error.to_string())?)),
        _ => Err("Unknown command".to_owned()),
    }
}

pub async fn serve(data_dir: PathBuf, legacy_dir: PathBuf) -> Result<(), String> {
    let migration_report = Arc::new(
        tokio::task::spawn_blocking({
            let data_dir = data_dir.clone();
            let legacy_dir = legacy_dir.clone();
            move || migration::migrate_snapshots(&legacy_dir, &data_dir)
        })
        .await
        .map_err(|error| error.to_string())?,
    );
    let state = Arc::new(ScanState::default());
    let (sender, mut receiver) = mpsc::unbounded_channel::<Response>();
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(response) = receiver.recv().await {
            let mut line = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
            line.push(b'\n');
            stdout
                .write_all(&line)
                .await
                .map_err(|error| error.to_string())?;
            stdout.flush().await.map_err(|error| error.to_string())?;
        }
        Ok::<(), String>(())
    });
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await.map_err(|error| error.to_string())? {
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                eprintln!("Invalid request: {error}");
                continue;
            }
        };
        let sender = sender.clone();
        let state = state.clone();
        let data_dir = data_dir.clone();
        let legacy_dir = legacy_dir.clone();
        let migration_report = migration_report.clone();
        tokio::spawn(async move {
            let result = dispatch(&request, &state, data_dir, legacy_dir, &migration_report).await;
            let response = match result {
                Ok(result) => Response {
                    id: request.id,
                    ok: true,
                    result: Some(result),
                    error: None,
                },
                Err(error) => Response {
                    id: request.id,
                    ok: false,
                    result: None,
                    error: Some(error),
                },
            };
            let _ = sender.send(response);
        });
    }
    drop(sender);
    writer.await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn rejects_unknown_command() {
        let request = Request {
            id: 1,
            command: "unsafe".into(),
            args: json!({}),
        };
        let result = dispatch(
            &request,
            &ScanState::default(),
            PathBuf::new(),
            PathBuf::new(),
            &migration::MigrationReport::default(),
        )
        .await;
        assert_eq!(result.unwrap_err(), "Unknown command");
    }
}
