//! 数据模型。字段名用 camelCase 序列化，前端与导出文件共用同一格式。

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::{self, LunarDate};

pub const SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_OFFSETS: [u32; 3] = [30, 7, 0];
/// 界面上可勾选的提前天数。
pub const OFFSET_CHOICES: [u32; 5] = [30, 7, 3, 1, 0];
pub const MAX_OFFSET: u32 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Birthday,
    Anniversary,
    Memorial,
    Festival,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarKind {
    Solar,
    Lunar,
}

/// 一条日期规则：每年在哪一天。`year` 是起始年（出生年、结婚年），农历时为农历年。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRule {
    pub calendar: CalendarKind,
    pub month: u32,
    pub day: u32,
    #[serde(default)]
    pub leap: bool,
    #[serde(default)]
    pub year: Option<i32>,
}

/// 用户新建或编辑时提交的内容。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub name: String,
    pub category: Category,
    #[serde(flatten)]
    pub rule: DateRule,
    pub offsets: Vec<u32>,
    #[serde(default)]
    pub note: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub name: String,
    pub category: Category,
    #[serde(flatten)]
    pub rule: DateRule,
    pub offsets: Vec<u32>,
    #[serde(default)]
    pub note: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// 触发日早于这一天的提醒阶段不再补发（新建或改日期时设为当天，避免刚录入就弹窗）。
    pub remind_from: NaiveDate,
    /// 用户已为这一次（当年的日期）做好准备：之后的提前提醒不再打扰，当天仍会提醒一次。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepared: Option<NaiveDate>,
}

impl Event {
    pub fn new(id: String, input: EventInput, now: DateTime<Utc>, today: NaiveDate) -> Self {
        let mut event = Event {
            id,
            name: String::new(),
            category: input.category,
            rule: input.rule,
            offsets: vec![],
            note: String::new(),
            enabled: true,
            created_at: now,
            updated_at: now,
            remind_from: today,
            prepared: None,
        };
        event.apply(input, now, today);
        event
    }

    /// 用编辑内容覆盖本条目。日期或提醒级别变化时重置 `remind_from`。
    pub fn apply(&mut self, input: EventInput, now: DateTime<Utc>, today: NaiveDate) {
        let offsets = normalize_offsets(&input.offsets);
        if input.rule != self.rule || offsets != self.offsets || (input.enabled && !self.enabled) {
            self.remind_from = today;
        }
        if input.rule != self.rule {
            // 日期变了，之前“已准备”的那一次不再成立
            self.prepared = None;
        }
        self.name = input.name.trim().to_string();
        self.category = input.category;
        self.rule = input.rule;
        self.offsets = offsets;
        self.note = input.note.trim().to_string();
        self.enabled = input.enabled;
        self.updated_at = now;
    }
}

/// 界面主题。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 每天开始提醒的时刻，格式 HH:MM。
    pub remind_time: String,
    pub autostart: bool,
    pub default_offsets: Vec<u32>,
    /// 启动后和每隔几小时自动检查 GitHub Releases 上有没有新版本。
    #[serde(default = "default_true")]
    pub check_updates: bool,
    #[serde(default)]
    pub theme: Theme,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            remind_time: "09:00".into(),
            autostart: true,
            default_offsets: DEFAULT_OFFSETS.to_vec(),
            check_updates: true,
            theme: Theme::System,
        }
    }
}

impl Settings {
    /// 解析 remind_time，返回 (时, 分)。
    pub fn remind_hm(&self) -> Option<(u32, u32)> {
        parse_hm(&self.remind_time)
    }
}

pub fn parse_hm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    let (h, m) = (h.trim().parse::<u32>().ok()?, m.trim().parse::<u32>().ok()?);
    (h < 24 && m < 60).then_some((h, m))
}

/// 已经发出的提醒。键是（条目, 当年日期, 阶段）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiredRecord {
    pub event_id: String,
    pub occurrence: NaiveDate,
    pub offset: u32,
    pub fired_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    pub schema_version: u32,
    #[serde(default)]
    pub events: Vec<Event>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub fired: Vec<FiredRecord>,
}

impl Default for Data {
    fn default() -> Self {
        Data {
            schema_version: SCHEMA_VERSION,
            events: vec![],
            settings: Settings::default(),
            fired: vec![],
        }
    }
}

impl Data {
    pub fn is_fired(&self, event_id: &str, occurrence: NaiveDate, offset: u32) -> bool {
        self.fired
            .iter()
            .any(|f| f.event_id == event_id && f.occurrence == occurrence && f.offset == offset)
    }

    /// 只保留最近 400 天内的已发记录，以及仍存在的条目的记录。
    pub fn prune_fired(&mut self, today: NaiveDate) {
        let ids: Vec<&str> = self.events.iter().map(|e| e.id.as_str()).collect();
        let cutoff = today - chrono::Duration::days(400);
        let fired = std::mem::take(&mut self.fired);
        self.fired = fired
            .into_iter()
            .filter(|f| f.occurrence >= cutoff && ids.contains(&f.event_id.as_str()))
            .collect();
    }

    /// 合并导入的数据：按 id 合并条目，同 id 时保留较新的一份；已发记录取并集。设置不导入。
    /// 返回（新增数, 更新数）。
    pub fn merge(&mut self, other: Data) -> (usize, usize) {
        let (mut added, mut updated) = (0, 0);
        for incoming in other.events {
            match self.events.iter_mut().find(|e| e.id == incoming.id) {
                Some(existing) => {
                    if incoming.updated_at > existing.updated_at {
                        *existing = incoming;
                        updated += 1;
                    }
                }
                None => {
                    self.events.push(incoming);
                    added += 1;
                }
            }
        }
        for f in other.fired {
            if !self.is_fired(&f.event_id, f.occurrence, f.offset) {
                self.fired.push(f);
            }
        }
        (added, updated)
    }
}

fn default_true() -> bool {
    true
}

/// 去重、降序、限制范围。
pub fn normalize_offsets(offsets: &[u32]) -> Vec<u32> {
    let mut v: Vec<u32> = offsets.iter().copied().filter(|o| *o <= MAX_OFFSET).collect();
    v.sort_unstable_by(|a, b| b.cmp(a));
    v.dedup();
    v
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ValidationError {
    #[error("请填写名称")]
    EmptyName,
    #[error("名称不能超过 40 个字")]
    NameTooLong,
    #[error("备注不能超过 500 个字")]
    NoteTooLong,
    #[error("月份必须在 1 到 12 之间")]
    BadMonth,
    #[error("这个月没有这一天")]
    BadDay,
    #[error("年份需在 {min} 到 {max} 之间")]
    BadYear { min: i32, max: i32 },
    #[error("只有农历才有闰月")]
    LeapOnSolar,
    #[error("农历 {year} 年没有闰{}", calendar::LUNAR_MONTH_NAMES[(*month as usize).clamp(1, 12) - 1])]
    NoSuchLeapMonth { year: i32, month: u32 },
    #[error("至少选择一个提醒时间")]
    NoOffsets,
}

impl EventInput {
    pub fn validate(&self) -> Result<(), ValidationError> {
        let name_len = self.name.trim().chars().count();
        if name_len == 0 {
            return Err(ValidationError::EmptyName);
        }
        if name_len > 40 {
            return Err(ValidationError::NameTooLong);
        }
        if self.note.chars().count() > 500 {
            return Err(ValidationError::NoteTooLong);
        }
        if normalize_offsets(&self.offsets).is_empty() {
            return Err(ValidationError::NoOffsets);
        }
        self.rule.validate()
    }
}

impl DateRule {
    pub fn validate(&self) -> Result<(), ValidationError> {
        let r = self;
        if !(1..=12).contains(&r.month) {
            return Err(ValidationError::BadMonth);
        }
        if let Some(y) = r.year {
            if !calendar::in_range(y) {
                return Err(ValidationError::BadYear { min: calendar::MIN_YEAR, max: calendar::MAX_YEAR });
            }
        }
        match r.calendar {
            CalendarKind::Solar => {
                if r.leap {
                    return Err(ValidationError::LeapOnSolar);
                }
                // 不填年份时按闰年校验，允许 2 月 29 日
                let max = calendar::solar_month_days(r.year.unwrap_or(2000), r.month).unwrap_or(0);
                if r.day < 1 || r.day > max {
                    return Err(ValidationError::BadDay);
                }
            }
            CalendarKind::Lunar => {
                if r.day < 1 || r.day > 30 {
                    return Err(ValidationError::BadDay);
                }
                if let Some(y) = r.year {
                    if r.leap && calendar::leap_month_of(y) != Some(r.month) {
                        return Err(ValidationError::NoSuchLeapMonth { year: y, month: r.month });
                    }
                    let days = calendar::lunar_month_days(y, r.month, r.leap).unwrap_or(0);
                    if r.day > days {
                        return Err(ValidationError::BadDay);
                    }
                }
            }
        }
        Ok(())
    }

    /// 起始那一天（填了年份时），用于显示“出生于 xx”。
    pub fn origin_date(&self) -> Option<NaiveDate> {
        let y = self.year?;
        match self.calendar {
            CalendarKind::Solar => NaiveDate::from_ymd_opt(y, self.month, self.day),
            CalendarKind::Lunar => calendar::lunar_to_solar(LunarDate {
                year: y,
                month: self.month,
                day: self.day,
                leap: self.leap,
            }),
        }
    }

    /// 例如“农历闰四月初八”或“公历 10月26日”。
    pub fn label(&self) -> String {
        match self.calendar {
            CalendarKind::Solar => format!("公历 {}月{}日", self.month, self.day),
            CalendarKind::Lunar => format!(
                "农历{}{}",
                calendar::month_name(self.month, self.leap),
                calendar::day_name(self.day)
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(calendar: CalendarKind, month: u32, day: u32, leap: bool, year: Option<i32>) -> DateRule {
        DateRule { calendar, month, day, leap, year }
    }

    #[test]
    fn validates_rules() {
        use CalendarKind::*;
        assert!(rule(Solar, 2, 29, false, None).validate().is_ok());
        assert!(rule(Solar, 2, 29, false, Some(2000)).validate().is_ok());
        assert_eq!(rule(Solar, 2, 29, false, Some(2001)).validate(), Err(ValidationError::BadDay));
        assert_eq!(rule(Solar, 4, 31, false, None).validate(), Err(ValidationError::BadDay));
        assert_eq!(rule(Solar, 13, 1, false, None).validate(), Err(ValidationError::BadMonth));
        assert_eq!(rule(Solar, 1, 1, true, None).validate(), Err(ValidationError::LeapOnSolar));
        assert!(rule(Lunar, 4, 8, true, Some(2020)).validate().is_ok());
        assert_eq!(
            rule(Lunar, 5, 8, true, Some(2020)).validate(),
            Err(ValidationError::NoSuchLeapMonth { year: 2020, month: 5 })
        );
        assert!(rule(Lunar, 12, 30, false, None).validate().is_ok());
        assert_eq!(rule(Lunar, 12, 30, false, Some(2025)).validate(), Err(ValidationError::BadDay));
        assert!(matches!(rule(Lunar, 1, 1, false, Some(1800)).validate(), Err(ValidationError::BadYear { .. })));
    }

    #[test]
    fn normalizes_offsets() {
        assert_eq!(normalize_offsets(&[0, 7, 30, 7, 99]), vec![30, 7, 0]);
    }

    #[test]
    fn labels() {
        assert_eq!(rule(CalendarKind::Lunar, 4, 8, true, None).label(), "农历闰四月初八");
        assert_eq!(rule(CalendarKind::Solar, 10, 26, false, None).label(), "公历 10月26日");
    }

    #[test]
    fn old_settings_and_events_still_load() {
        // 0.1 的数据文件没有 checkUpdates / theme / prepared 字段
        let s: Settings = serde_json::from_str(r#"{"remindTime":"08:30","autostart":false,"defaultOffsets":[7,0]}"#).unwrap();
        assert!(s.check_updates);
        assert_eq!(s.theme, Theme::System);
        let e: Event = serde_json::from_str(
            r#"{"id":"a","name":"x","category":"birthday","calendar":"solar","month":1,"day":2,
                "offsets":[0],"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","remindFrom":"2026-01-01"}"#,
        )
        .unwrap();
        assert_eq!(e.prepared, None);
        // 没有标记“已准备”时不写出该字段，0.1 版也能读
        assert!(!serde_json::to_string(&e).unwrap().contains("prepared"));
    }

    #[test]
    fn changing_date_clears_prepared() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 10).unwrap();
        let input = EventInput {
            name: "a".into(),
            category: Category::Birthday,
            rule: rule(CalendarKind::Solar, 10, 20, false, None),
            offsets: vec![7, 0],
            note: String::new(),
            enabled: true,
        };
        let mut e = Event::new("a".into(), input.clone(), Utc::now(), today);
        e.prepared = NaiveDate::from_ymd_opt(2026, 10, 20);
        // 只改名字：保留
        e.apply(EventInput { name: "b".into(), ..input.clone() }, Utc::now(), today);
        assert!(e.prepared.is_some());
        // 改日期：清除
        e.apply(EventInput { rule: rule(CalendarKind::Solar, 10, 21, false, None), ..input }, Utc::now(), today);
        assert_eq!(e.prepared, None);
    }

    #[test]
    fn parses_time() {
        assert_eq!(parse_hm("09:00"), Some((9, 0)));
        assert_eq!(parse_hm("23:59"), Some((23, 59)));
        assert_eq!(parse_hm("24:00"), None);
        assert_eq!(parse_hm("9"), None);
    }
}
