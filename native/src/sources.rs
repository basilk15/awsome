use aws_config::{BehaviorVersion, Region};
use aws_sdk_ec2::Client as Ec2Client;
use std::{collections::BTreeSet, env, fs, path::PathBuf};

fn aws_file(env_name: &str, fallback: &str) -> Option<PathBuf> {
    env::var_os(env_name)
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".aws").join(fallback)))
}

fn profile_names(text: &str, config_file: bool) -> Vec<String> {
    text.lines()
        .filter_map(|line| {
            let section = line.trim().strip_prefix('[')?.split(']').next()?.trim();
            let name = if config_file {
                if section == "default" {
                    "default"
                } else {
                    section.strip_prefix("profile ")?
                }
            } else {
                section
            };
            if name.is_empty() {
                None
            } else {
                Some(name.to_owned())
            }
        })
        .collect()
}

pub(crate) fn list_profiles() -> Vec<String> {
    let mut profiles = BTreeSet::from(["default".to_owned()]);
    for (env_name, fallback, config_file) in [
        ("AWS_CONFIG_FILE", "config", true),
        ("AWS_SHARED_CREDENTIALS_FILE", "credentials", false),
    ] {
        if let Some(path) = aws_file(env_name, fallback) {
            if let Ok(text) = fs::read_to_string(path) {
                profiles.extend(profile_names(&text, config_file));
            }
        }
    }
    profiles.into_iter().collect()
}

pub(crate) async fn list_regions(profile: String) -> Result<Vec<String>, String> {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .profile_name(if profile.trim().is_empty() {
            "default"
        } else {
            profile.trim()
        })
        .load()
        .await;
    let mut ec2_config = aws_sdk_ec2::config::Builder::from(&config);
    if config.region().is_none() {
        ec2_config = ec2_config.region(Region::new("us-east-1"));
    }
    let response = Ec2Client::from_conf(ec2_config.build())
        .describe_regions()
        .send()
        .await
        .map_err(|error| format!("Could not list enabled regions: {error}"))?;
    let mut regions: Vec<String> = response
        .regions()
        .iter()
        .filter_map(|region| region.region_name().map(str::to_owned))
        .collect();
    regions.sort();
    Ok(regions)
}

#[cfg(test)]
mod tests {
    use super::profile_names;
    #[test]
    fn reads_profile_sections_without_exposing_values() {
        assert_eq!(profile_names("[default]\nregion = us-east-1\n[profile team dev]\naws_access_key_id=secret\n[sso-session corp]", true), vec!["default", "team dev"]);
        assert_eq!(
            profile_names("[staging]\naws_secret_access_key=secret", false),
            vec!["staging"]
        );
    }
}
