//! 本地 JSON 存储：先写临时文件再替换，替换前保留 .bak；主文件损坏时从备份恢复。

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::model::{Data, SCHEMA_VERSION};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("读写数据文件失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("数据文件格式错误：{0}")]
    Parse(#[from] serde_json::Error),
    #[error("数据文件来自更新版本的刻忆（格式版本 {0}），请升级后再打开")]
    TooNew(u32),
}

#[derive(Debug)]
pub struct LoadOutcome {
    pub data: Data,
    /// 主文件损坏、已从备份恢复。损坏的文件改名保留在同目录。
    pub recovered_from_backup: bool,
}

pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Store { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn sibling(&self, suffix: &str) -> PathBuf {
        let mut name = self.path.file_name().unwrap_or_default().to_os_string();
        name.push(suffix);
        self.path.with_file_name(name)
    }

    pub fn backup_path(&self) -> PathBuf {
        self.sibling(".bak")
    }

    /// 读取数据。文件不存在时返回空数据；主文件损坏时尝试备份，两者都坏才报错（不会覆盖任何文件）。
    pub fn load(&self) -> Result<LoadOutcome, StoreError> {
        if !self.path.exists() {
            return Ok(LoadOutcome { data: Data::default(), recovered_from_backup: false });
        }
        match read_file(&self.path) {
            Ok(data) => Ok(LoadOutcome { data, recovered_from_backup: false }),
            Err(StoreError::TooNew(v)) => Err(StoreError::TooNew(v)),
            Err(main_err) => {
                let backup = self.backup_path();
                if !backup.exists() {
                    return Err(main_err);
                }
                let data = read_file(&backup).map_err(|_| main_err)?;
                let stamp = chrono::Local::now().format("%Y%m%d%H%M%S");
                let _ = fs::rename(&self.path, self.sibling(&format!(".corrupt-{stamp}")));
                Ok(LoadOutcome { data, recovered_from_backup: true })
            }
        }
    }

    pub fn save(&self, data: &Data) -> Result<(), StoreError> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_vec_pretty(data)?;
        let tmp = self.sibling(".tmp");
        {
            let mut f = fs::File::create(&tmp)?;
            f.write_all(&json)?;
            f.sync_all()?;
        }
        if self.path.exists() {
            fs::copy(&self.path, self.backup_path())?;
        }
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

/// 解析一段 JSON（数据文件或导入文件），并迁移到当前格式版本。
pub fn parse(json: &str) -> Result<Data, StoreError> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    let version = value.get("schemaVersion").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
    if version > SCHEMA_VERSION {
        return Err(StoreError::TooNew(version));
    }
    // 目前只有版本 1；以后的迁移在这里按版本逐级升级 value。
    let mut data: Data = serde_json::from_value(value)?;
    data.schema_version = SCHEMA_VERSION;
    Ok(data)
}

fn read_file(path: &Path) -> Result<Data, StoreError> {
    let text = fs::read_to_string(path)?;
    parse(text.trim_start_matches('\u{feff}'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CalendarKind, Category, DateRule, Event, EventInput};
    use chrono::{NaiveDate, Utc};

    fn sample() -> Data {
        let mut data = Data::default();
        let input = EventInput {
            name: "妈妈生日".into(),
            category: Category::Birthday,
            rule: DateRule { calendar: CalendarKind::Lunar, month: 9, day: 6, leap: false, year: Some(1966) },
            offsets: vec![30, 7, 0],
            note: "喜欢兰花".into(),
            enabled: true,
        };
        data.events.push(Event::new("id-1".into(), input, Utc::now(), NaiveDate::from_ymd_opt(2026, 10, 10).unwrap()));
        data
    }

    #[test]
    fn round_trip_and_backup() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("daymark.json"));
        assert_eq!(store.load().unwrap().data, Data::default());
        let data = sample();
        store.save(&data).unwrap();
        assert!(!store.backup_path().exists());
        store.save(&data).unwrap();
        assert!(store.backup_path().exists());
        assert_eq!(store.load().unwrap().data, data);
    }

    #[test]
    fn recovers_from_backup() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("daymark.json"));
        let data = sample();
        store.save(&data).unwrap();
        store.save(&data).unwrap();
        fs::write(store.path(), "{ broken").unwrap();
        let out = store.load().unwrap();
        assert!(out.recovered_from_backup);
        assert_eq!(out.data, data);
        assert!(fs::read_dir(dir.path())
            .unwrap()
            .any(|e| e.unwrap().file_name().to_string_lossy().contains(".corrupt-")));
    }

    #[test]
    fn refuses_when_both_broken() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("daymark.json"));
        fs::write(store.path(), "{ broken").unwrap();
        assert!(matches!(store.load(), Err(StoreError::Parse(_))));
        // 原文件保持不动
        assert_eq!(fs::read_to_string(store.path()).unwrap(), "{ broken");
    }

    #[test]
    fn rejects_newer_schema() {
        assert!(matches!(parse(r#"{"schemaVersion": 99}"#), Err(StoreError::TooNew(99))));
    }

    #[test]
    fn json_shape_is_camel_case() {
        let json = serde_json::to_string(&sample()).unwrap();
        for key in ["schemaVersion", "\"calendar\":\"lunar\"", "remindFrom", "remindTime", "defaultOffsets"] {
            assert!(json.contains(key), "missing {key} in {json}");
        }
        assert_eq!(parse(&json).unwrap(), sample_with_same_times(&json));
    }

    fn sample_with_same_times(json: &str) -> Data {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn merge_keeps_newer() {
        let mut a = sample();
        let mut b = a.clone();
        b.events[0].name = "母亲生日".into();
        b.events[0].updated_at = a.events[0].updated_at + chrono::Duration::seconds(5);
        let mut other = sample();
        other.events[0].id = "id-2".into();
        b.events.push(other.events[0].clone());
        assert_eq!(a.merge(b), (1, 1));
        assert_eq!(a.events[0].name, "母亲生日");
        assert_eq!(a.events.len(), 2);
    }
}
