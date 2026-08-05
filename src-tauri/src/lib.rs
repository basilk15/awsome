mod topology;

#[tauri::command]
async fn fetch_topology(profile: String, region: String) -> Result<topology::Graph, String> {
    topology::fetch_topology(profile, region).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_topology])
        .run(tauri::generate_context!())
        .expect("error while running awsome");
}
