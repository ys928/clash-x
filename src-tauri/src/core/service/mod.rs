//! Service orchestration facade. Implementation is split by responsibility.

mod ipc;
mod manager;
mod owner;
mod paths;
mod platform;
mod providers;
mod shared;

#[cfg(test)]
mod tests;

pub(crate) use ipc::*;
pub(crate) use manager::*;
pub(crate) use owner::*;
pub(crate) use paths::*;
pub(crate) use platform::*;
pub(crate) use providers::*;
pub(crate) use shared::*;
pub(crate) use shared::{
    ServiceStatus, active_service_session, active_service_supports_runtime_file_read,
    active_service_supports_runtime_staging, clear_active_service_session, trusted_service_evidence,
};
