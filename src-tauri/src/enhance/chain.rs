use super::SeqMap;
use crate::{
    config::PrfItem,
    utils::{dirs, help},
};
use smartstring::alias::String;

#[derive(Debug, Clone)]
pub struct ChainItem {
    pub uid: String,
    pub data: ChainType,
}

#[derive(Debug, Clone)]
pub enum ChainType {
    Rules(SeqMap),
    Proxies(SeqMap),
    Groups(SeqMap),
}

// Helper trait to allow async conversion
pub trait AsyncChainItemFrom {
    async fn from_async(item: &PrfItem) -> Option<ChainItem>;
}

impl AsyncChainItemFrom for Option<ChainItem> {
    async fn from_async(item: &PrfItem) -> Self {
        let itype = item.itype.as_ref()?.as_str();
        let file = item.file.clone()?;
        let uid = item.uid.clone().unwrap_or_else(|| "".into());
        let path = dirs::app_profiles_dir().ok()?.join(file.as_str());

        if !path.exists() {
            return None;
        }

        match itype {
            "rules" => {
                let seq_map = help::read_yaml::<SeqMap>(&path).await.ok()?;
                Some(ChainItem {
                    uid,
                    data: ChainType::Rules(seq_map),
                })
            }
            "proxies" => {
                let seq_map = help::read_yaml::<SeqMap>(&path).await.ok()?;
                Some(ChainItem {
                    uid,
                    data: ChainType::Proxies(seq_map),
                })
            }
            "groups" => {
                let seq_map = help::read_yaml::<SeqMap>(&path).await.ok()?;
                Some(ChainItem {
                    uid,
                    data: ChainType::Groups(seq_map),
                })
            }
            // merge/script items are ignored (legacy compatibility)
            _ => None,
        }
    }
}
