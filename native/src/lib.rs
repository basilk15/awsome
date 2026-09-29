mod migration;
mod server;
mod snapshots;
mod sources;
mod topology;

pub use server::serve;

use futures_util::stream::{self, StreamExt};
use serde::Serialize;
use std::{
    future::Future,
    sync::{Arc, Mutex},
};
use tokio::sync::Notify;

const MAX_CONCURRENT_REGION_SCANS: usize = 3;
const STEPS_PER_REGION: usize = 22;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegionScanProgress {
    region: String,
    completed: usize,
    total: usize,
    stage: String,
    status: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    request_id: String,
    completed: usize,
    total: usize,
    stage: String,
    regions: Vec<RegionScanProgress>,
}

impl ScanProgress {
    fn new(request_id: String, regions: &[String]) -> Self {
        Self {
            request_id,
            completed: 0,
            total: STEPS_PER_REGION * regions.len(),
            stage: "Connecting to AWS".to_owned(),
            regions: regions
                .iter()
                .map(|region| RegionScanProgress {
                    region: region.clone(),
                    completed: 0,
                    total: STEPS_PER_REGION,
                    stage: "Waiting".to_owned(),
                    status: "queued".to_owned(),
                })
                .collect(),
        }
    }

    fn update_region(&mut self, region: &str, stage: &str, status: &str, advance: bool) {
        let Some(item) = self.regions.iter_mut().find(|item| item.region == region) else {
            return;
        };
        item.stage = stage.to_owned();
        item.status = status.to_owned();
        if status == "succeeded" || status == "failed" {
            item.completed = item.total;
        } else if advance {
            item.completed = (item.completed + 1).min(item.total);
        }
        self.completed = self.regions.iter().map(|item| item.completed).sum();
        self.stage = format!("{region}: {stage}");
    }
}

struct ActiveScan {
    progress: ScanProgress,
    cancel: Arc<Notify>,
}

#[derive(Default)]
struct ScanState(Mutex<Option<ActiveScan>>);

fn validated_regions(regions: Vec<String>) -> Result<Vec<String>, String> {
    let mut cleaned: Vec<String> = regions
        .into_iter()
        .map(|region| region.trim().to_owned())
        .collect();
    if cleaned.is_empty()
        || cleaned.iter().any(|region| {
            region.is_empty()
                || region.len() > 32
                || !region
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        })
    {
        return Err("Choose one or more valid AWS regions".to_owned());
    }
    cleaned.sort();
    cleaned.dedup();
    if cleaned.len() > 50 {
        return Err("Choose at most 50 AWS regions".to_owned());
    }
    Ok(cleaned)
}

async fn scan_regions_bounded<T, F, Fut>(
    regions: &[String],
    scan: F,
) -> Vec<(String, Result<T, String>)>
where
    F: Fn(String) -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    stream::iter(regions.iter().cloned())
        .map(|region| {
            let future = Box::pin(scan(region.clone()));
            async move { (region, future.await) }
        })
        .buffer_unordered(MAX_CONCURRENT_REGION_SCANS)
        .collect()
        .await
}

pub(crate) async fn fetch_topology(
    profile: String,
    regions: Vec<String>,
    request_id: String,
    state: &ScanState,
) -> Result<topology::Graph, String> {
    let regions = validated_regions(regions)?;
    let cancel = Arc::new(Notify::new());
    {
        let mut active = state.0.lock().map_err(|error| error.to_string())?;
        if active.is_some() {
            return Err("A topology scan is already running".to_owned());
        }
        *active = Some(ActiveScan {
            progress: ScanProgress::new(request_id.clone(), &regions),
            cancel: cancel.clone(),
        });
    }
    let on_progress = |region: &str, stage: &str, status: &str, advance: bool| {
        if let Ok(mut active) = state.0.lock() {
            if let Some(scan) = active
                .as_mut()
                .filter(|scan| scan.progress.request_id == request_id)
            {
                scan.progress.update_region(region, stage, status, advance);
            }
        }
    };
    let scan = async {
        let mut found = Vec::new();
        let mut failed = Vec::new();
        let results = scan_regions_bounded(&regions, |region| {
            let profile = profile.clone();
            let on_progress = &on_progress;
            async move {
                on_progress(&region, "Connecting to AWS", "running", false);
                let region_progress = |stage: &str| on_progress(&region, stage, "running", true);
                let result =
                    topology::fetch_topology(profile, region.clone(), &region_progress).await;
                on_progress(
                    &region,
                    if result.is_ok() { "Complete" } else { "Failed" },
                    if result.is_ok() {
                        "succeeded"
                    } else {
                        "failed"
                    },
                    false,
                );
                result
            }
        })
        .await;
        for (region, result) in results {
            match result {
                Ok(graph) => found.push((region, graph)),
                Err(error) => failed.push((region, error)),
            }
        }
        found.sort_by(|a, b| a.0.cmp(&b.0));
        failed.sort_by(|a, b| a.0.cmp(&b.0));
        if found.is_empty() {
            return Err(format!(
                "All selected regions failed. First error: {}",
                failed
                    .first()
                    .map(|(_, error)| error.as_str())
                    .unwrap_or("AWS inventory unavailable")
            ));
        }
        Ok(topology::merge_region_graphs(regions, found, failed))
    };
    let result = tokio::select! {
        result = scan => result,
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

#[cfg(test)]
mod tests {
    use super::{
        scan_regions_bounded, topology, validated_regions, ScanProgress,
        MAX_CONCURRENT_REGION_SCANS,
    };
    use std::{
        future::{pending, Future},
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        task::{Context, Poll},
    };

    #[test]
    fn regions_are_validated_deduplicated_and_sorted() {
        assert_eq!(
            validated_regions(vec![
                "us-east-1".into(),
                " ap-southeast-2 ".into(),
                "us-east-1".into()
            ])
            .unwrap(),
            vec!["ap-southeast-2", "us-east-1"]
        );
        assert!(validated_regions(vec![]).is_err());
        assert!(validated_regions(vec!["US_EAST_1".into()]).is_err());
    }

    #[test]
    fn progress_tracks_each_region_and_finishes_failed_regions() {
        let mut progress = ScanProgress::new("request".into(), &["east".into(), "west".into()]);
        progress.update_region("east", "VPCs", "running", true);
        progress.update_region("west", "Connecting to AWS", "running", false);
        assert_eq!(progress.completed, 1);
        assert_eq!(progress.regions[0].completed, 1);
        assert_eq!(progress.regions[1].completed, 0);
        progress.update_region("east", "Failed", "failed", false);
        assert_eq!(progress.completed, 22);
        assert_eq!(progress.regions[0].status, "failed");
        assert_eq!(progress.regions[1].status, "running");
    }

    #[tokio::test]
    async fn scans_at_most_three_regions_at_once() {
        let regions: Vec<String> = (0..7).map(|index| format!("region-{index}")).collect();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let results = scan_regions_bounded(&regions, |region| {
            let active = Arc::clone(&active);
            let peak = Arc::clone(&peak);
            async move {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(current, Ordering::SeqCst);
                tokio::task::yield_now().await;
                active.fetch_sub(1, Ordering::SeqCst);
                Ok(region)
            }
        })
        .await;
        assert_eq!(results.len(), regions.len());
        assert_eq!(peak.load(Ordering::SeqCst), MAX_CONCURRENT_REGION_SCANS);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn cancelling_a_scan_drops_all_in_flight_regions() {
        struct ActiveRegion(Arc<AtomicUsize>);
        impl Drop for ActiveRegion {
            fn drop(&mut self) {
                self.0.fetch_sub(1, Ordering::SeqCst);
            }
        }

        let regions: Vec<String> = (0..5).map(|index| format!("region-{index}")).collect();
        let active = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(AtomicUsize::new(0));
        let mut scan = Box::pin(scan_regions_bounded(&regions, |_| {
            let active = Arc::clone(&active);
            let started = Arc::clone(&started);
            async move {
                active.fetch_add(1, Ordering::SeqCst);
                started.fetch_add(1, Ordering::SeqCst);
                let _guard = ActiveRegion(active);
                pending::<Result<(), String>>().await
            }
        }));
        let waker = futures_util::task::noop_waker();
        let mut context = Context::from_waker(&waker);
        assert!(matches!(scan.as_mut().poll(&mut context), Poll::Pending));
        assert_eq!(started.load(Ordering::SeqCst), MAX_CONCURRENT_REGION_SCANS);
        assert_eq!(active.load(Ordering::SeqCst), MAX_CONCURRENT_REGION_SCANS);
        drop(scan);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    #[ignore = "requires AWSOME_SMOKE_REGIONS and read-only AWS access"]
    async fn live_multi_region_inventory_smoke() {
        let regions = std::env::var("AWSOME_SMOKE_REGIONS")
            .expect("set AWSOME_SMOKE_REGIONS to two comma-separated AWS regions")
            .split(',')
            .map(|region| region.trim().to_owned())
            .collect::<Vec<_>>();
        let regions = validated_regions(regions).expect("valid AWS regions");
        assert!(regions.len() >= 2, "select at least two regions");
        let profile = std::env::var("AWSOME_SMOKE_PROFILE").unwrap_or_else(|_| "default".into());
        let results = scan_regions_bounded(&regions, |region| {
            let profile = profile.clone();
            async move {
                let progress = |_stage: &str| {};
                topology::fetch_topology(profile, region, &progress).await
            }
        })
        .await;
        let mut found = Vec::new();
        for (region, result) in results {
            found.push((
                region.clone(),
                result.unwrap_or_else(|error| panic!("{region}: {error}")),
            ));
        }
        found.sort_by(|a, b| a.0.cmp(&b.0));
        let graph = topology::merge_region_graphs(regions.clone(), found, Vec::new());
        assert_eq!(graph.regions, regions);
        assert_eq!(graph.coverage.len(), regions.len());
        assert!(graph.coverage.iter().all(|coverage| !coverage.failed));
    }
}

pub(crate) fn get_scan_progress(state: &ScanState) -> Option<ScanProgress> {
    state
        .0
        .lock()
        .ok()?
        .as_ref()
        .map(|scan| scan.progress.clone())
}

pub(crate) fn cancel_scan(request_id: String, state: &ScanState) -> bool {
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
