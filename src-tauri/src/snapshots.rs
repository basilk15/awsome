use crate::topology::Graph;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    version: u8,
    id: String,
    profile: String,
    region: String,
    captured_at: String,
    graph: Graph,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotSummary {
    id: String,
    profile: String,
    region: String,
    captured_at: String,
    nodes: usize,
    edges: usize,
    warnings: usize,
}

impl Snapshot {
    fn summary(&self) -> SnapshotSummary {
        SnapshotSummary {
            id: self.id.clone(),
            profile: self.profile.clone(),
            region: self.region.clone(),
            captured_at: self.captured_at.clone(),
            nodes: self.graph.nodes.len(),
            edges: self.graph.edges.len(),
            warnings: self.graph.warnings.len(),
        }
    }
}

fn snapshot_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("snapshots"))
}

fn snapshot_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-') {
        return Err("Invalid snapshot ID".to_owned());
    }
    Ok(dir.join(format!("{id}.json")))
}

fn read_snapshot(path: &Path) -> Result<Snapshot, String> {
    let snapshot: Snapshot =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("Invalid snapshot: {error}"))?;
    if snapshot.version != SCHEMA_VERSION {
        return Err("Unsupported snapshot version".to_owned());
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn save_snapshot(
    app: tauri::AppHandle,
    profile: String,
    region: String,
    graph: Graph,
) -> Result<SnapshotSummary, String> {
    let dir = snapshot_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let id = format!("{}-{}", now.as_secs(), now.subsec_nanos());
    let snapshot = Snapshot {
        version: SCHEMA_VERSION,
        id: id.clone(),
        profile,
        region,
        captured_at: format!("{}", now.as_millis()),
        graph,
    };
    let path = snapshot_path(&dir, &id)?;
    let temp_path = dir.join(format!("{id}.tmp"));
    fs::write(
        &temp_path,
        serde_json::to_vec(&snapshot).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&temp_path, &path).map_err(|error| error.to_string())?;
    Ok(snapshot.summary())
}

#[tauri::command]
pub(crate) fn list_snapshots(app: tauri::AppHandle) -> Result<Vec<SnapshotSummary>, String> {
    let dir = snapshot_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut summaries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        if let Ok(snapshot) = read_snapshot(&path) {
            summaries.push(snapshot.summary());
        }
    }
    summaries.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(summaries)
}

#[tauri::command]
pub(crate) fn load_snapshot(app: tauri::AppHandle, id: String) -> Result<Snapshot, String> {
    let dir = snapshot_dir(&app)?;
    let snapshot = read_snapshot(&snapshot_path(&dir, &id)?)?;
    if snapshot.id != id {
        return Err("Snapshot ID mismatch".to_owned());
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn delete_snapshot(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = snapshot_dir(&app)?;
    fs::remove_file(snapshot_path(&dir, &id)?).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_round_trips_and_rejects_path_traversal() {
        let dir = std::env::temp_dir().join(format!("awsome-snapshot-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let snapshot = Snapshot {
            version: SCHEMA_VERSION,
            id: "123-456".to_owned(),
            profile: "team".to_owned(),
            region: "us-east-1".to_owned(),
            captured_at: "123456".to_owned(),
            graph: Graph {
                nodes: Vec::new(),
                edges: Vec::new(),
                warnings: vec!["partial".to_owned()],
            },
        };
        let path = snapshot_path(&dir, &snapshot.id).unwrap();
        fs::write(&path, serde_json::to_vec(&snapshot).unwrap()).unwrap();
        let loaded = read_snapshot(&path).unwrap();
        assert_eq!(loaded.summary().warnings, 1);
        assert_eq!(loaded.summary().profile, "team");
        assert!(snapshot_path(&dir, "../private").is_err());
        fs::remove_file(path).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
