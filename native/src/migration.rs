use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs, io,
    path::Path,
};

use crate::snapshots;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationReport {
    pub(crate) copied: usize,
    pub(crate) skipped: usize,
    pub(crate) warnings: Vec<String>,
}

pub(crate) fn migrate_snapshots(legacy_data: &Path, data_dir: &Path) -> MigrationReport {
    let mut report = MigrationReport::default();
    let source = legacy_data.join("snapshots");
    if !source.is_dir() {
        return report;
    }
    let ledger_path = data_dir.join("migrated-snapshot-ids.json");
    let mut handled: BTreeSet<String> = match fs::read(&ledger_path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(ids) => ids,
            Err(error) => {
                report
                    .warnings
                    .push(format!("Could not read scan migration history: {error}"));
                return report;
            }
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => BTreeSet::new(),
        Err(error) => {
            report
                .warnings
                .push(format!("Could not read scan migration history: {error}"));
            return report;
        }
    };
    let target = data_dir.join("snapshots");
    if let Err(error) = fs::create_dir_all(&target) {
        report
            .warnings
            .push(format!("Could not prepare scan storage: {error}"));
        return report;
    }
    let entries = match fs::read_dir(&source) {
        Ok(entries) => entries,
        Err(error) => {
            report
                .warnings
                .push(format!("Could not inspect prior scans: {error}"));
            return report;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                report
                    .warnings
                    .push(format!("Could not inspect a prior scan: {error}"));
                continue;
            }
        };
        let path = entry.path();
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(id) = name.strip_suffix(".json") else {
            continue;
        };
        if !id.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-') || id.is_empty() {
            continue;
        }
        if handled.contains(id) {
            report.skipped += 1;
            continue;
        }
        if target.join(name).exists() {
            handled.insert(id.to_owned());
            report.skipped += 1;
            continue;
        }
        if let Err(error) = snapshots::load_at(&source, id) {
            report
                .warnings
                .push(format!("Prior scan {id} was not imported: {error}"));
            continue;
        }
        let temporary = target.join(format!("{id}.migration.tmp"));
        let copy = (|| -> io::Result<()> {
            let mut input = fs::File::open(&path)?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            io::copy(&mut input, &mut output)?;
            output.sync_all()?;
            fs::hard_link(&temporary, target.join(name))?;
            Ok(())
        })();
        if temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        match copy {
            Ok(()) => {
                report.copied += 1;
                handled.insert(id.to_owned());
            }
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists && target.join(name).exists() =>
            {
                report.skipped += 1;
                handled.insert(id.to_owned());
            }
            Err(error) => report
                .warnings
                .push(format!("Prior scan {id} was not imported: {error}")),
        }
    }
    if !handled.is_empty() {
        let temporary = data_dir.join("migrated-snapshot-ids.tmp");
        let write = serde_json::to_vec(&handled)
            .map_err(io::Error::other)
            .and_then(|bytes| fs::write(&temporary, bytes))
            .and_then(|_| fs::rename(&temporary, &ledger_path));
        if let Err(error) = write {
            report
                .warnings
                .push(format!("Could not save scan migration history: {error}"));
        }
    }
    report
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlanningMigration {
    pub(crate) entries: BTreeMap<String, String>,
    pub(crate) warnings: Vec<String>,
}

pub(crate) fn read_legacy_planning(legacy_data: &Path) -> PlanningMigration {
    let mut result = PlanningMigration {
        entries: BTreeMap::new(),
        warnings: Vec::new(),
    };
    let directory = legacy_data.join("localstorage");
    let files = match fs::read_dir(directory) {
        Ok(files) => files,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return result,
        Err(error) => {
            result
                .warnings
                .push(format!("Could not inspect prior planning storage: {error}"));
            return result;
        }
    };
    let mut paths = files
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                return false;
            };
            name.ends_with(".localstorage")
                && (name.contains("tauri") || name == "http_localhost_5173.localstorage")
        })
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| {
        path.file_name()
            .is_some_and(|name| name == "http_localhost_5173.localstorage")
    });
    for path in paths {
        let connection = match Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        {
            Ok(connection) => connection,
            Err(error) => {
                result
                    .warnings
                    .push(format!("Could not read prior planning storage: {error}"));
                continue;
            }
        };
        let mut statement = match connection.prepare("SELECT key, value FROM ItemTable WHERE key = 'awsome.theme' OR key = 'graphivo.planning.last-document' OR key = 'graphivo.planning.library.index' OR key LIKE 'graphivo.planning.library.document.%'") {
            Ok(statement) => statement,
            Err(error) => {
                result.warnings.push(format!("Could not inspect prior planning storage: {error}"));
                continue;
            }
        };
        let rows = match statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
        }) {
            Ok(rows) => rows,
            Err(error) => {
                result
                    .warnings
                    .push(format!("Could not inspect prior planning entries: {error}"));
                continue;
            }
        };
        for row in rows {
            let (key, value) = match row {
                Ok(row) => row,
                Err(error) => {
                    result
                        .warnings
                        .push(format!("Could not read a prior planning entry: {error}"));
                    continue;
                }
            };
            if value.len() % 2 != 0 {
                result
                    .warnings
                    .push(format!("Prior planning entry {key} has invalid encoding"));
                continue;
            }
            let units = value
                .chunks_exact(2)
                .map(|bytes| u16::from_le_bytes([bytes[0], bytes[1]]))
                .collect::<Vec<_>>();
            match String::from_utf16(&units) {
                Ok(text) => {
                    result.entries.entry(key).or_insert(text);
                }
                Err(_) => result
                    .warnings
                    .push(format!("Prior planning entry {key} has invalid encoding")),
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn reads_utf16_planning_without_changing_source() {
        let root = std::env::temp_dir().join(format!("awsome-migrate-{}", std::process::id()));
        fs::create_dir_all(root.join("localstorage")).unwrap();
        let db = root.join("localstorage/http_localhost_5173.localstorage");
        let connection = Connection::open(&db).unwrap();
        connection
            .execute("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)", [])
            .unwrap();
        let value: Vec<u8> = "{\"version\":1}"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        connection
            .execute(
                "INSERT INTO ItemTable VALUES (?1, ?2)",
                rusqlite::params!["graphivo.planning.last-document", value],
            )
            .unwrap();
        drop(connection);
        let imported = read_legacy_planning(&root);
        assert_eq!(
            imported.entries.get("graphivo.planning.last-document"),
            Some(&"{\"version\":1}".to_owned())
        );
        assert!(imported.warnings.is_empty());
        fs::remove_file(db).unwrap();
        fs::remove_dir(root.join("localstorage")).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn copies_valid_scans_once_and_leaves_bad_or_conflicting_files_untouched() {
        let root =
            std::env::temp_dir().join(format!("awsome-snapshot-migrate-{}", std::process::id()));
        let legacy = root.join("legacy");
        let target = root.join("target");
        fs::create_dir_all(legacy.join("snapshots")).unwrap();
        let valid = json!({
            "version": 1, "id": "123-456", "profile": "default", "region": "us-east-1",
            "capturedAt": "123456", "graph": { "nodes": [], "edges": [], "warnings": [] }
        });
        fs::write(
            legacy.join("snapshots/123-456.json"),
            serde_json::to_vec(&valid).unwrap(),
        )
        .unwrap();
        fs::write(legacy.join("snapshots/124-456.json"), b"invalid").unwrap();
        let first = migrate_snapshots(&legacy, &target);
        assert_eq!(first.copied, 1);
        assert_eq!(first.warnings.len(), 1);
        assert_eq!(
            fs::read(legacy.join("snapshots/123-456.json")).unwrap(),
            fs::read(target.join("snapshots/123-456.json")).unwrap()
        );
        fs::remove_file(target.join("snapshots/123-456.json")).unwrap();
        let second = migrate_snapshots(&legacy, &target);
        assert_eq!(second.copied, 0);
        assert_eq!(second.skipped, 1);
        assert!(!target.join("snapshots/123-456.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
