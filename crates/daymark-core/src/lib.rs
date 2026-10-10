//! 刻忆核心：不依赖 Tauri，可单独测试，后续可编译为 WebAssembly 复用。

pub mod calendar;
mod lunar_table;
pub mod model;
pub mod occurrence;
pub mod reminder;
pub mod store;

pub use calendar::{LunarDate, MAX_YEAR, MIN_YEAR};
pub use model::*;
pub use occurrence::{next_occurrence, occurrence_in_year, Occurrence};
pub use reminder::{due_reminders, upcoming, DueReminder, Upcoming};
pub use store::{LoadOutcome, Store, StoreError};
