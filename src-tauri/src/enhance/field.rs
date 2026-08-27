use serde_yaml_ng::{Mapping, Value};
use smartstring::alias::String;

/// Large list fields are written last so settings remain readable at the top.
const TRAILING_FIELDS: [&str; 5] = ["proxies", "proxy-providers", "proxy-groups", "rule-providers", "rules"];

pub fn use_sort(config: Mapping) -> Mapping {
    let mut sorted = Mapping::new();
    let mut trailing = Mapping::new();

    for (key, value) in config {
        if key.as_str().is_some_and(|key| TRAILING_FIELDS.contains(&key)) {
            trailing.insert(key, value);
        } else {
            sorted.insert(key, value);
        }
    }

    for key in TRAILING_FIELDS {
        let key = Value::from(key);
        if let Some(value) = trailing.remove(&key) {
            sorted.insert(key, value);
        }
    }

    sorted
}

#[inline]
pub fn use_keys<'a>(config: &'a Mapping) -> impl Iterator<Item = String> + 'a {
    config.iter().filter_map(|(key, _)| key.as_str()).map(|s: &str| {
        let mut s: String = s.into();
        s.make_ascii_lowercase();
        s
    })
}
