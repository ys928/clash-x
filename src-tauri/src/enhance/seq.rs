use serde::{Deserialize, Serialize};
use serde_yaml_ng::{Mapping, Sequence, Value};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SeqMap {
    pub prepend: Sequence,
    pub append: Sequence,
    pub delete: Vec<String>,
}

/// Merge global rule prepend/append/delete into the profile rules list.
pub fn merge_rules(seq: SeqMap, mut config: Mapping) -> Mapping {
    let SeqMap {
        prepend,
        append,
        delete,
    } = seq;

    let mut rules = Sequence::new();
    rules.extend(prepend);

    if let Some(Value::Sequence(existing)) = config.remove("rules") {
        let kept: Sequence = existing
            .into_iter()
            .filter(|item| item.as_str().is_none_or(|s| !delete.iter().any(|d| d == s)))
            .collect();
        rules.extend(kept);
    }

    rules.extend(append);
    config.insert(Value::from("rules"), Value::Sequence(rules));
    config
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::panic, reason = "tests assert by panicking")]
mod tests {
    use super::*;

    #[test]
    fn merges_prepend_append_and_delete() {
        let mut config = Mapping::new();
        config.insert(
            Value::from("rules"),
            Value::Sequence(Sequence::from_iter([
                Value::from("DOMAIN,old.com,DIRECT"),
                Value::from("DOMAIN,drop.me,REJECT"),
            ])),
        );

        let seq = SeqMap {
            prepend: Sequence::from_iter([Value::from("DOMAIN,first.com,DIRECT")]),
            append: Sequence::from_iter([Value::from("MATCH,DIRECT")]),
            delete: vec!["DOMAIN,drop.me,REJECT".into()],
        };

        let result = merge_rules(seq, config);
        let rules = result
            .get(Value::from("rules"))
            .and_then(Value::as_sequence)
            .expect("rules should be a sequence");

        let rules: Vec<_> = rules.iter().filter_map(Value::as_str).collect();
        assert_eq!(
            rules,
            vec!["DOMAIN,first.com,DIRECT", "DOMAIN,old.com,DIRECT", "MATCH,DIRECT",]
        );
    }
}
