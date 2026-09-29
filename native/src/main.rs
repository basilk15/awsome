use std::{env, path::PathBuf};

#[tokio::main]
async fn main() {
    let mut args = env::args_os().skip(1);
    let Some(data_dir) = args.next().map(PathBuf::from) else {
        eprintln!("Usage: awsome-native <data-dir> <legacy-data-dir>");
        std::process::exit(2);
    };
    let Some(legacy_dir) = args.next().map(PathBuf::from) else {
        eprintln!("Usage: awsome-native <data-dir> <legacy-data-dir>");
        std::process::exit(2);
    };
    if let Err(error) = awsome_native::serve(data_dir, legacy_dir).await {
        eprintln!("awsome-native: {error}");
        std::process::exit(1);
    }
}
