mod snapshots;
mod sources;
mod topology;

use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    request_id: String,
    completed: usize,
    total: usize,
    stage: String,
}

struct ActiveScan {
    progress: ScanProgress,
    cancel: Arc<Notify>,
}

#[derive(Default)]
struct ScanState(Mutex<Option<ActiveScan>>);

#[tauri::command]
async fn fetch_topology(
    profile: String,
    region: String,
    request_id: String,
    state: tauri::State<'_, ScanState>,
) -> Result<topology::Graph, String> {
    let cancel = Arc::new(Notify::new());
    {
        let mut active = state.0.lock().map_err(|error| error.to_string())?;
        if active.is_some() {
            return Err("A topology scan is already running".to_owned());
        }
        *active = Some(ActiveScan {
            progress: ScanProgress {
                request_id: request_id.clone(),
                completed: 0,
                total: 22,
                stage: "Connecting to AWS".to_owned(),
            },
            cancel: cancel.clone(),
        });
    }
    let on_progress = |stage: &str| {
        if let Ok(mut active) = state.0.lock() {
            if let Some(scan) = active
                .as_mut()
                .filter(|scan| scan.progress.request_id == request_id)
            {
                scan.progress.completed += 1;
                scan.progress.stage = stage.to_owned();
            }
        }
    };
    let result = tokio::select! {
        result = topology::fetch_topology(profile, region, &on_progress) => result,
        _ = cancel.notified() => Err("Scan cancelled".to_owned()),
    };
    if let Ok(mut active) = state.0.lock() {
        if active
            .as_ref()
            .is_some_and(|scan| scan.progress.request_id == request_id)
        {
            *active = None;
        }
    }
    result
}

#[tauri::command]
fn get_scan_progress(state: tauri::State<'_, ScanState>) -> Option<ScanProgress> {
    state
        .0
        .lock()
        .ok()?
        .as_ref()
        .map(|scan| scan.progress.clone())
}

#[tauri::command]
fn cancel_scan(request_id: String, state: tauri::State<'_, ScanState>) -> bool {
    if let Ok(mut active) = state.0.lock() {
        if let Some(scan) = active
            .as_mut()
            .filter(|scan| scan.progress.request_id == request_id)
        {
            scan.progress.stage = "Cancelling scan".to_owned();
            scan.cancel.notify_one();
            return true;
        }
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanState::default())
        .invoke_handler(tauri::generate_handler![
            fetch_topology,
            get_scan_progress,
            cancel_scan,
            snapshots::save_snapshot,
            snapshots::list_snapshots,
            snapshots::load_snapshot,
            snapshots::delete_snapshot,
            sources::list_profiles,
            sources::list_regions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running awsome");
}
