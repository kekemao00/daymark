//! 提醒阶段判断与通知文案。
//!
//! 阶段：offsets（如 [30, 7, 0]）中不小于剩余天数的最小值。剩 20 天处于“30 天”阶段，
//! 剩 7 天处于“7 天”阶段。每个（条目, 当年日期, 阶段）只提醒一次；错过的只补发当前阶段。

use chrono::{Datelike, NaiveDate};
use serde::Serialize;

use crate::calendar;
use crate::model::{Category, Data, Event};
use crate::occurrence::{next_occurrence, Occurrence};

/// 当前所处的提醒阶段。剩余天数大于所有提前量时为 None。
pub fn current_stage(offsets: &[u32], days_until: i64) -> Option<u32> {
    offsets
        .iter()
        .copied()
        .filter(|o| *o as i64 >= days_until)
        .min()
}

/// 首页列表的一行。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Upcoming {
    pub event_id: String,
    pub date: NaiveDate,
    pub days_until: i64,
    pub weekday: String,
    /// 这一天的农历，如“九月初六”。
    pub lunar_label: Option<String>,
    /// 规则本身，如“农历九月初六”“公历 10月26日”。
    pub rule_label: String,
    /// 如“60 岁生日”“3 周年”。
    pub count_label: Option<String>,
    /// 用户已为这一次做好准备（礼物、安排都定了）。
    pub prepared: bool,
}

pub fn upcoming_for(event: &Event, today: NaiveDate) -> Option<Upcoming> {
    let occ = next_occurrence(&event.rule, today)?;
    Some(Upcoming {
        event_id: event.id.clone(),
        date: occ.date,
        days_until: (occ.date - today).num_days(),
        weekday: calendar::weekday_name(occ.date).to_string(),
        lunar_label: calendar::solar_to_lunar(occ.date).map(|l| l.label()),
        rule_label: event.rule.label(),
        count_label: count_label(event, &occ),
        prepared: event.prepared == Some(occ.date),
    })
}

/// 所有条目（包括已停用的）按剩余天数排序。
pub fn upcoming(events: &[Event], today: NaiveDate) -> Vec<Upcoming> {
    let mut list: Vec<(Upcoming, &str)> = events
        .iter()
        .filter_map(|e| upcoming_for(e, today).map(|u| (u, e.name.as_str())))
        .collect();
    list.sort_by(|a, b| a.0.days_until.cmp(&b.0.days_until).then_with(|| a.1.cmp(b.1)));
    list.into_iter().map(|(u, _)| u).collect()
}

pub fn count_label(event: &Event, occ: &Occurrence) -> Option<String> {
    let n = occ.count(&event.rule)?;
    if n < 1 {
        return None;
    }
    match event.category {
        Category::Birthday => Some(format!("{n} 岁生日")),
        Category::Anniversary | Category::Memorial => Some(format!("{n} 周年")),
        Category::Other => Some(format!("第 {n} 年")),
        Category::Festival => None,
    }
}

/// 一条该发出的提醒。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueReminder {
    pub event_id: String,
    pub occurrence: NaiveDate,
    pub offset: u32,
    pub days_until: i64,
    pub title: String,
    pub body: String,
}

/// `today` 这一天应发出且尚未发出的提醒。调用方负责只在到达每日提醒时刻后调用。
///
/// 标记了“已准备”的那一次，提前提醒不再发出，当天仍提醒一次。
pub fn due_reminders(data: &Data, today: NaiveDate) -> Vec<DueReminder> {
    let mut due = vec![];
    for event in data.events.iter().filter(|e| e.enabled) {
        let Some(occ) = next_occurrence(&event.rule, today) else { continue };
        let days_until = (occ.date - today).num_days();
        let Some(stage) = current_stage(&event.offsets, days_until) else { continue };
        if stage > 0 && event.prepared == Some(occ.date) {
            continue;
        }
        // 阶段的触发日早于 remind_from（新建或改日期那天）就跳过，避免刚录入就弹窗
        let trigger = occ.date - chrono::Duration::days(stage as i64);
        if trigger < event.remind_from {
            continue;
        }
        if data.is_fired(&event.id, occ.date, stage) {
            continue;
        }
        let (title, body) = message(event, &occ, days_until);
        due.push(DueReminder {
            event_id: event.id.clone(),
            occurrence: occ.date,
            offset: stage,
            days_until,
            title,
            body,
        });
    }
    due.sort_by_key(|d| d.days_until);
    due
}

/// 通知标题与正文。
pub fn message(event: &Event, occ: &Occurrence, days_until: i64) -> (String, String) {
    let name = &event.name;
    let title = match days_until {
        0 => format!("今天是「{name}」"),
        1 => format!("明天是「{name}」"),
        2 => format!("后天是「{name}」"),
        n => format!("「{name}」还有 {n} 天"),
    };
    let mut parts = vec![format!(
        "{}月{}日 {}",
        occ.date.month(),
        occ.date.day(),
        calendar::weekday_name(occ.date)
    )];
    if let Some(lunar) = calendar::solar_to_lunar(occ.date) {
        parts.push(format!("农历{}", lunar.label()));
    }
    if let Some(c) = count_label(event, occ) {
        parts.push(c);
    }
    let mut body = parts.join(" · ");
    if !event.note.is_empty() {
        let note: String = event.note.chars().take(60).collect();
        let ellipsis = if event.note.chars().count() > 60 { "…" } else { "" };
        body.push_str(&format!("\n备注：{note}{ellipsis}"));
    }
    (title, body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CalendarKind, DateRule, EventInput, FiredRecord};
    use chrono::{TimeZone, Utc};

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    fn event(id: &str, rule: DateRule, offsets: &[u32], created: NaiveDate) -> Event {
        let input = EventInput {
            name: format!("测试{id}"),
            category: Category::Birthday,
            rule,
            offsets: offsets.to_vec(),
            note: String::new(),
            enabled: true,
        };
        Event::new(id.into(), input, Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(), created)
    }

    fn solar(month: u32, day: u32) -> DateRule {
        DateRule { calendar: CalendarKind::Solar, month, day, leap: false, year: Some(1990) }
    }

    fn fire(data: &mut Data, today: NaiveDate) -> Vec<DueReminder> {
        let due = due_reminders(data, today);
        for r in &due {
            data.fired.push(FiredRecord {
                event_id: r.event_id.clone(),
                occurrence: r.occurrence,
                offset: r.offset,
                fired_at: Utc::now(),
            });
        }
        due
    }

    #[test]
    fn stages() {
        let o = [30, 7, 0];
        assert_eq!(current_stage(&o, 31), None);
        assert_eq!(current_stage(&o, 30), Some(30));
        assert_eq!(current_stage(&o, 20), Some(30));
        assert_eq!(current_stage(&o, 7), Some(7));
        assert_eq!(current_stage(&o, 1), Some(7));
        assert_eq!(current_stage(&o, 0), Some(0));
        assert_eq!(current_stage(&[30], 3), Some(30));
    }

    #[test]
    fn fires_each_stage_once_over_a_year() {
        let mut data = Data::default();
        data.events.push(event("a", solar(12, 25), &[30, 7, 0], d(2026, 1, 1)));
        let mut fired_on = vec![];
        let mut day = d(2026, 1, 1);
        while day <= d(2026, 12, 31) {
            // 每天检查两次，模拟重启
            for r in fire(&mut data, day).into_iter().chain(fire(&mut data, day)) {
                fired_on.push((day, r.offset, r.days_until));
            }
            day = day.succ_opt().unwrap();
        }
        assert_eq!(
            fired_on,
            vec![(d(2026, 11, 25), 30, 30), (d(2026, 12, 18), 7, 7), (d(2026, 12, 25), 0, 0)]
        );
    }

    #[test]
    fn catches_up_only_current_stage() {
        let mut data = Data::default();
        data.events.push(event("a", solar(12, 25), &[30, 7, 0], d(2026, 1, 1)));
        // 11-25 到 12-19 一直关机，12-20 开机：只补发 7 天阶段，文案用真实剩余 5 天
        let due = fire(&mut data, d(2026, 12, 20));
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].offset, 7);
        assert_eq!(due[0].days_until, 5);
        assert_eq!(due[0].title, "「测试a」还有 5 天");
        assert!(fire(&mut data, d(2026, 12, 21)).is_empty());
        assert_eq!(fire(&mut data, d(2026, 12, 25))[0].title, "今天是「测试a」");
    }

    #[test]
    fn new_event_does_not_fire_past_stage() {
        let mut data = Data::default();
        // 12-05 新建，距 12-25 还有 20 天：30 天阶段的触发日（11-25）早于新建日，不补发
        data.events.push(event("a", solar(12, 25), &[30, 7, 0], d(2026, 12, 5)));
        assert!(fire(&mut data, d(2026, 12, 5)).is_empty());
        assert_eq!(fire(&mut data, d(2026, 12, 18))[0].offset, 7);
        // 新建当天正好是触发日，照常提醒
        let mut data = Data::default();
        data.events.push(event("b", solar(12, 25), &[30, 7, 0], d(2026, 12, 18)));
        assert_eq!(fire(&mut data, d(2026, 12, 18)).len(), 1);
    }

    #[test]
    fn disabled_events_are_skipped_and_next_year_fires_again() {
        let mut data = Data::default();
        let mut e = event("a", solar(1, 10), &[0], d(2026, 1, 1));
        e.enabled = false;
        data.events.push(e);
        assert!(fire(&mut data, d(2026, 1, 10)).is_empty());
        data.events[0].enabled = true;
        assert_eq!(fire(&mut data, d(2026, 1, 10)).len(), 1);
        assert_eq!(fire(&mut data, d(2027, 1, 10)).len(), 1);
    }

    #[test]
    fn prepared_mutes_advance_reminders_but_not_the_day() {
        let mut data = Data::default();
        data.events.push(event("a", solar(12, 25), &[30, 7, 0], d(2026, 1, 1)));
        assert_eq!(fire(&mut data, d(2026, 11, 25)).len(), 1);
        // 收到 30 天提醒后标记“已准备”：7 天阶段不再提醒，当天仍提醒
        data.events[0].prepared = Some(d(2026, 12, 25));
        assert!(fire(&mut data, d(2026, 12, 18)).is_empty());
        assert_eq!(fire(&mut data, d(2026, 12, 25))[0].offset, 0);
        // 明年是新的一次，照常提醒
        assert_eq!(fire(&mut data, d(2027, 11, 25))[0].offset, 30);
        let list = upcoming(&data.events, d(2027, 11, 25));
        assert!(!list[0].prepared);
    }

    #[test]
    fn upcoming_reports_prepared_for_this_occurrence_only() {
        let mut e = event("a", solar(12, 25), &[0], d(2026, 1, 1));
        e.prepared = Some(d(2026, 12, 25));
        assert!(upcoming(&[e.clone()], d(2026, 12, 1))[0].prepared);
        assert!(!upcoming(&[e], d(2027, 1, 1))[0].prepared);
    }

    #[test]
    fn lunar_event_message() {
        let mut data = Data::default();
        let rule = DateRule { calendar: CalendarKind::Lunar, month: 9, day: 6, leap: false, year: Some(1966) };
        let mut e = event("m", rule, &[30, 7, 0], d(2026, 1, 1));
        e.name = "妈妈生日".into();
        e.note = "喜欢兰花".into();
        data.events.push(e);
        let occ = next_occurrence(&rule, d(2026, 10, 10)).unwrap();
        let due = due_reminders(&data, d(2026, 10, 10));
        assert_eq!(due.len(), 1);
        let days = (occ.date - d(2026, 10, 10)).num_days();
        assert_eq!(due[0].title, format!("「妈妈生日」还有 {days} 天"));
        assert!(due[0].body.contains("农历九月初六"), "{}", due[0].body);
        assert!(due[0].body.contains("60 岁生日"));
        assert!(due[0].body.ends_with("备注：喜欢兰花"));
    }

    #[test]
    fn upcoming_sorted() {
        let events = vec![
            event("late", solar(12, 1), &[0], d(2026, 1, 1)),
            event("soon", solar(10, 12), &[0], d(2026, 1, 1)),
            event("today", solar(10, 10), &[0], d(2026, 1, 1)),
        ];
        let list = upcoming(&events, d(2026, 10, 10));
        let ids: Vec<&str> = list.iter().map(|u| u.event_id.as_str()).collect();
        assert_eq!(ids, vec!["today", "soon", "late"]);
        assert_eq!(list[0].days_until, 0);
        assert_eq!(list[0].count_label.as_deref(), Some("36 岁生日"));
        assert_eq!(list[0].weekday, "周六");
    }
}
