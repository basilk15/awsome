use crate::topology::Graph;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotSummary {
    id: String,
    profile: String,
    region: String,
    captured_at: String,
    nodes: usize,
    edges: usize,
    warnings: usize,
    #[serde(default)]
    bytes: u64,
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
            bytes: 0,
        }
    }
}

fn snapshot_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("snapshots")
}

fn snapshot_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-') {
        return Err("Invalid snapshot ID".to_owned());
    }
    Ok(dir.join(format!("{id}.json")))
}

fn summary_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    snapshot_path(dir, id)?;
    Ok(dir.join(format!("{id}.summary.json")))
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

fn write_summary(dir: &Path, summary: &SnapshotSummary) -> Result<(), String> {
    let path = summary_path(dir, &summary.id)?;
    let temp_path = dir.join(format!("{}.summary.tmp", summary.id));
    fs::write(
        &temp_path,
        serde_json::to_vec(summary).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&temp_path, path).map_err(|error| error.to_string())
}

fn save_at(
    dir: &Path,
    profile: String,
    region: String,
    graph: Graph,
) -> Result<SnapshotSummary, String> {
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let id = format!("{}-{:09}", now.as_secs(), now.subsec_nanos());
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
    let data = serde_json::to_vec(&snapshot).map_err(|error| error.to_string())?;
    fs::write(&temp_path, &data).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, &path).map_err(|error| error.to_string())?;
    let mut summary = snapshot.summary();
    summary.bytes = data.len() as u64;
    let _ = write_summary(dir, &summary);
    Ok(summary)
}

fn list_at(dir: &Path) -> Result<Vec<SnapshotSummary>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut summaries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json")
            || path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(".summary.json"))
        {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if snapshot_path(dir, id).is_err() {
            continue;
        }
        let cached = summary_path(dir, id)
            .ok()
            .and_then(|sidecar| fs::read(sidecar).ok())
            .and_then(|bytes| serde_json::from_slice::<SnapshotSummary>(&bytes).ok())
            .filter(|summary| {
                summary.id == id
                    && fs::metadata(&path).is_ok_and(|metadata| summary.bytes == metadata.len())
            });
        if let Some(summary) = cached {
            summaries.push(summary);
        } else if let Ok(snapshot) = read_snapshot(&path) {
            if snapshot.id != id {
                continue;
            }
            let mut summary = snapshot.summary();
            summary.bytes = fs::metadata(&path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            let _ = write_summary(dir, &summary);
            summaries.push(summary);
        }
    }
    summaries.sort_by(|a, b| {
        let timestamp = |summary: &SnapshotSummary| {
            summary
                .id
                .split_once('-')
                .and_then(|(seconds, nanos)| {
                    Some((seconds.parse::<u64>().ok()?, nanos.parse::<u32>().ok()?))
                })
                .map(|(seconds, nanos)| seconds as u128 * 1_000_000_000 + nanos as u128)
                .or_else(|| {
                    summary
                        .captured_at
                        .parse::<u128>()
                        .ok()
                        .map(|millis| millis * 1_000_000)
                })
                .unwrap_or_default()
        };
        timestamp(b)
            .cmp(&timestamp(a))
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(summaries)
}

pub(crate) fn load_at(dir: &Path, id: &str) -> Result<Snapshot, String> {
    let snapshot = read_snapshot(&snapshot_path(&dir, &id)?)?;
    if snapshot.id != id {
        return Err("Snapshot ID mismatch".to_owned());
    }
    Ok(snapshot)
}

fn delete_at(dir: &Path, id: &str) -> Result<(), String> {
    fs::remove_file(snapshot_path(&dir, id)?).map_err(|error| error.to_string())?;
    if let Ok(path) = summary_path(dir, id) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

fn preview_prune_at(dir: &Path, keep_per_source: usize) -> Result<Vec<SnapshotSummary>, String> {
    if keep_per_source == 0 || keep_per_source > 100 {
        return Err("Choose between 1 and 100 scans to retain per source".to_owned());
    }
    let mut counts = BTreeMap::<(String, String), usize>::new();
    let mut candidates = Vec::new();
    for listed in list_at(dir)? {
        let snapshot = load_at(dir, &listed.id)?;
        let mut summary = snapshot.summary();
        summary.bytes = fs::metadata(snapshot_path(dir, &listed.id)?)
            .map_err(|error| error.to_string())?
            .len();
        if summary != listed {
            let _ = write_summary(dir, &summary);
        }
        let count = counts
            .entry((summary.profile.clone(), summary.region.clone()))
            .or_default();
        *count += 1;
        if *count > keep_per_source {
            candidates.push(summary);
        }
    }
    Ok(candidates)
}

fn prune_at(
    dir: &Path,
    keep_per_source: usize,
    expected: &[SnapshotSummary],
) -> Result<usize, String> {
    let candidates = preview_prune_at(dir, keep_per_source)?;
    if candidates != expected {
        return Err(
            "Saved scans changed after the cleanup preview. Review the list again.".to_owned(),
        );
    }
    for summary in &candidates {
        delete_at(dir, &summary.id)?;
    }
    Ok(candidates.len())
}

pub(crate) async fn save_snapshot(
    data_dir: PathBuf,
    profile: String,
    region: String,
    graph: Graph,
) -> Result<SnapshotSummary, String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || save_at(&dir, profile, region, graph))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn list_snapshots(data_dir: PathBuf) -> Result<Vec<SnapshotSummary>, String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || list_at(&dir))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn load_snapshot(data_dir: PathBuf, id: String) -> Result<Snapshot, String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || load_at(&dir, &id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn delete_snapshot(data_dir: PathBuf, id: String) -> Result<(), String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || delete_at(&dir, &id))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn preview_prune_snapshots(
    data_dir: PathBuf,
    keep_per_source: usize,
) -> Result<Vec<SnapshotSummary>, String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || preview_prune_at(&dir, keep_per_source))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn prune_snapshots(
    data_dir: PathBuf,
    keep_per_source: usize,
    expected: Vec<SnapshotSummary>,
) -> Result<usize, String> {
    let dir = snapshot_dir(&data_dir);
    tokio::task::spawn_blocking(move || prune_at(&dir, keep_per_source, &expected))
        .await
        .map_err(|error| error.to_string())?
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
                regions: Vec::new(),
                coverage: Vec::new(),
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

    #[test]
    fn legacy_scans_gain_summaries_and_cleanup_keeps_recent_scans_per_source() {
        let dir =
            std::env::temp_dir().join(format!("awsome-snapshot-library-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let graph = || Graph {
            nodes: Vec::new(),
            edges: Vec::new(),
            warnings: Vec::new(),
            regions: Vec::new(),
            coverage: Vec::new(),
        };
        let first = save_at(&dir, "team".into(), "us-east-1".into(), graph()).unwrap();
        let second = save_at(&dir, "team".into(), "us-east-1".into(), graph()).unwrap();
        let other = save_at(&dir, "team".into(), "us-west-2".into(), graph()).unwrap();
        fs::remove_file(summary_path(&dir, &first.id).unwrap()).unwrap();
        let listed = list_at(&dir).unwrap();
        assert_eq!(listed.len(), 3);
        assert!(summary_path(&dir, &first.id).unwrap().exists());
        assert!(listed.iter().all(|item| item.bytes > 0));
        let preview = preview_prune_at(&dir, 1).unwrap();
        assert_eq!(preview.len(), 1);
        assert!(prune_at(&dir, 1, &[]).is_err());
        assert!(load_at(&dir, &first.id).is_ok());
        let mut stale_summary = preview[0].clone();
        stale_summary.profile = "different-profile".to_owned();
        write_summary(&dir, &stale_summary).unwrap();
        assert_eq!(preview_prune_at(&dir, 1).unwrap(), preview);
        assert_eq!(prune_at(&dir, 1, &preview).unwrap(), 1);
        assert!(load_at(&dir, &first.id).is_err());
        assert!(load_at(&dir, &second.id).is_ok());
        assert!(load_at(&dir, &other.id).is_ok());
        for item in list_at(&dir).unwrap() {
            delete_at(&dir, &item.id).unwrap();
        }
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn reads_version_one_graphs_saved_before_coverage_metadata() {
        let dir =
            std::env::temp_dir().join(format!("awsome-legacy-snapshot-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = snapshot_path(&dir, "123-456").unwrap();
        let legacy = serde_json::json!({
            "version": 1, "id": "123-456", "profile": "default", "region": "us-east-1",
            "capturedAt": "123456", "graph": { "nodes": [], "edges": [], "warnings": [] }
        });
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        let loaded = load_at(&dir, "123-456").unwrap();
        assert!(loaded.graph.coverage.is_empty());
        assert!(loaded.graph.regions.is_empty());
        assert_eq!(list_at(&dir).unwrap().len(), 1);
        delete_at(&dir, "123-456").unwrap();
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn retention_orders_legacy_same_second_ids_by_time() {
        let dir =
            std::env::temp_dir().join(format!("awsome-snapshot-order-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        for (id, captured_at) in [("1000-9000000", "1000009"), ("1000-110000000", "1000110")] {
            let snapshot = serde_json::json!({
                "version": 1, "id": id, "profile": "team", "region": "us-east-1",
                "capturedAt": captured_at, "graph": { "nodes": [], "edges": [], "warnings": [] }
            });
            fs::write(
                snapshot_path(&dir, id).unwrap(),
                serde_json::to_vec(&snapshot).unwrap(),
            )
            .unwrap();
        }
        assert_eq!(list_at(&dir).unwrap()[0].id, "1000-110000000");
        let preview = preview_prune_at(&dir, 1).unwrap();
        assert_eq!(preview.len(), 1);
        assert_eq!(prune_at(&dir, 1, &preview).unwrap(), 1);
        assert!(load_at(&dir, "1000-110000000").is_ok());
        assert!(load_at(&dir, "1000-9000000").is_err());
        delete_at(&dir, "1000-110000000").unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
