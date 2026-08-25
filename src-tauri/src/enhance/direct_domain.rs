//! Companion DNS / OS-bypass helpers for global DIRECT domain rules.
//!
//! A bare `DOMAIN-SUFFIX,corp.local,DIRECT` rule only chooses the outbound.
//! Clash still resolves the hostname with its own DNS (often public DoH), which
//! cannot see VPN / intranet zones — the HTTP proxy then returns 502.
//! These helpers force system DNS for those domains and expose OS proxy bypass
//! patterns so system-proxy clients can skip Clash entirely.

use super::seq::SeqMap;
use crate::{
    config::Config,
    utils::{dirs, help},
};
use serde_yaml_ng::{Mapping, Sequence, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DirectDomainKind {
    Exact,
    Suffix,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectDomain {
    pub kind: DirectDomainKind,
    pub domain: String,
}

impl DirectDomain {
    /// Mihomo `nameserver-policy` key (`+.suffix` / exact host).
    pub fn nameserver_policy_key(&self) -> String {
        match self.kind {
            DirectDomainKind::Exact => self.domain.clone(),
            DirectDomainKind::Suffix => format!("+.{}", self.domain),
        }
    }

    /// Fake-IP filter entry so the real IP is looked up.
    pub fn fake_ip_filter_entry(&self) -> String {
        match self.kind {
            DirectDomainKind::Exact => self.domain.clone(),
            DirectDomainKind::Suffix => format!("*.{}", self.domain),
        }
    }

    /// Windows / macOS / Linux system-proxy bypass pattern.
    pub fn sysproxy_pattern(&self) -> String {
        match self.kind {
            DirectDomainKind::Exact => self.domain.clone(),
            DirectDomainKind::Suffix => format!("*.{}", self.domain),
        }
    }
}

/// Parse DOMAIN / DOMAIN-SUFFIX rules whose policy is DIRECT from a SeqMap.
pub fn extract_direct_domains(seq: &SeqMap) -> Vec<DirectDomain> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for value in seq.prepend.iter().chain(seq.append.iter()) {
        let Some(raw) = value.as_str() else {
            continue;
        };
        let Some(domain) = parse_direct_domain_rule(raw) else {
            continue;
        };
        let key = format!("{:?}:{}", domain.kind, domain.domain.to_ascii_lowercase());
        if seen.insert(key) {
            out.push(domain);
        }
    }

    out
}

fn parse_direct_domain_rule(raw: &str) -> Option<DirectDomain> {
    let parts: Vec<&str> = raw.split(',').map(str::trim).filter(|p| !p.is_empty()).collect();
    if parts.len() < 3 {
        return None;
    }

    let kind = match parts[0].to_ascii_uppercase().as_str() {
        "DOMAIN" => DirectDomainKind::Exact,
        "DOMAIN-SUFFIX" => DirectDomainKind::Suffix,
        _ => return None,
    };

    let policy = parts[2].to_ascii_uppercase();
    if policy != "DIRECT" {
        return None;
    }

    let domain = parts[1].trim_start_matches('.').trim().to_ascii_lowercase();
    if domain.is_empty() || domain.contains([' ', '/', '\\']) {
        return None;
    }

    Some(DirectDomain { kind, domain })
}

/// Inject `nameserver-policy: system` (+ fake-ip-filter) for DIRECT domains into an existing dns block.
pub fn apply_direct_domain_dns(mut config: Mapping, domains: &[DirectDomain]) -> Mapping {
    if domains.is_empty() {
        return config;
    }

    let Some(Value::Mapping(dns)) = config.get_mut(Value::from("dns")) else {
        // No Clash DNS — OS resolver / system-proxy bypass handles resolution.
        return config;
    };

    let policy_key = Value::from("nameserver-policy");
    let mut policy = dns
        .get(&policy_key)
        .and_then(Value::as_mapping)
        .cloned()
        .unwrap_or_default();

    let system_ns = Value::Sequence(Sequence::from_iter([Value::from("system")]));
    for domain in domains {
        let key = Value::from(domain.nameserver_policy_key());
        if !policy.contains_key(&key) {
            policy.insert(key, system_ns.clone());
        }
    }
    dns.insert(policy_key, Value::Mapping(policy));

    let filter_key = Value::from("fake-ip-filter");
    let mut filter = dns
        .get(&filter_key)
        .and_then(Value::as_sequence)
        .cloned()
        .unwrap_or_default();
    let existing: HashSet<String> = filter
        .iter()
        .filter_map(Value::as_str)
        .map(|s| s.to_ascii_lowercase())
        .collect();
    for domain in domains {
        let entry = domain.fake_ip_filter_entry();
        if existing.contains(&entry.to_ascii_lowercase()) {
            continue;
        }
        filter.push(Value::from(entry));
    }
    dns.insert(filter_key, Value::Sequence(filter));

    config
}

/// Append unique bypass patterns using the platform separator.
pub fn merge_sysproxy_bypass(base: &str, separator: &str, patterns: &[String]) -> String {
    if patterns.is_empty() {
        return base.to_owned();
    }

    let mut existing: HashSet<String> = base
        .split(separator)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let mut result = base.trim().to_owned();
    for pattern in patterns {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            continue;
        }
        let key = pattern.to_ascii_lowercase();
        if !existing.insert(key) {
            continue;
        }
        if !result.is_empty() {
            result.push_str(separator);
        }
        result.push_str(pattern);
    }
    result
}

pub async fn load_global_rules_seq() -> Option<SeqMap> {
    let profiles = Config::profiles().await.latest_arc();
    let item = profiles.get_item("Rules").ok()?;
    let file = item.file.as_ref()?;
    let path = dirs::app_profiles_dir().ok()?.join(file.as_str());
    help::read_yaml::<SeqMap>(&path).await.ok()
}

pub async fn global_direct_sysproxy_patterns() -> Vec<String> {
    let Some(seq) = load_global_rules_seq().await else {
        return Vec::new();
    };
    extract_direct_domains(&seq)
        .into_iter()
        .map(|d| d.sysproxy_pattern())
        .collect()
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::panic, reason = "tests assert by panicking")]
mod tests {
    use super::*;
    use serde_yaml_ng::Sequence;

    fn seq_with_prepend(rules: &[&str]) -> SeqMap {
        SeqMap {
            prepend: Sequence::from_iter(rules.iter().map(|r| Value::from(*r))),
            append: Sequence::new(),
            delete: Vec::new(),
        }
    }

    #[test]
    fn extracts_domain_and_suffix_direct_rules() {
        let seq = seq_with_prepend(&[
            "DOMAIN-SUFFIX,suanleme.local,DIRECT",
            "DOMAIN,api.internal,DIRECT",
            "DOMAIN-SUFFIX,google.com,PROXY",
            "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
            "DOMAIN-SUFFIX,suanleme.local,DIRECT",
        ]);
        let domains = extract_direct_domains(&seq);
        assert_eq!(
            domains,
            vec![
                DirectDomain {
                    kind: DirectDomainKind::Suffix,
                    domain: "suanleme.local".into(),
                },
                DirectDomain {
                    kind: DirectDomainKind::Exact,
                    domain: "api.internal".into(),
                },
            ]
        );
    }

    #[test]
    fn injects_nameserver_policy_and_fake_ip_filter() {
        let mut config = Mapping::new();
        let mut dns = Mapping::new();
        dns.insert(Value::from("enable"), Value::from(true));
        dns.insert(Value::from("enhanced-mode"), Value::from("fake-ip"));
        config.insert(Value::from("dns"), Value::Mapping(dns));

        let domains = vec![DirectDomain {
            kind: DirectDomainKind::Suffix,
            domain: "suanleme.local".into(),
        }];
        let config = apply_direct_domain_dns(config, &domains);
        let dns = config.get(Value::from("dns")).and_then(Value::as_mapping).expect("dns");
        let policy = dns
            .get(Value::from("nameserver-policy"))
            .and_then(Value::as_mapping)
            .expect("policy");
        assert_eq!(
            policy.get(Value::from("+.suanleme.local")),
            Some(&Value::Sequence(Sequence::from_iter([Value::from("system")])))
        );
        let filter = dns
            .get(Value::from("fake-ip-filter"))
            .and_then(Value::as_sequence)
            .expect("filter");
        assert!(filter.iter().any(|v| v.as_str() == Some("*.suanleme.local")));
    }

    #[test]
    fn merge_sysproxy_bypass_dedupes() {
        assert_eq!(
            merge_sysproxy_bypass("localhost;*.local", ";", &["*.local".into(), "*.corp".into()]),
            "localhost;*.local;*.corp"
        );
    }
}
