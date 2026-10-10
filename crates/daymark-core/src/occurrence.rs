//! 计算一条日期规则在某一年、以及“今天及以后”对应的公历日期。
//!
//! 规则：
//! - 公历 2 月 29 日在平年落到 2 月 28 日。
//! - 农历闰月条目：当年有同名闰月时过闰月，否则过同名普通月；普通月条目每年都过普通月。
//! - 农历三十遇到只有 29 天的月份，落到该月最后一天。
//! - 填了起始年份时，不会算出早于起始年的日期。

use chrono::{Datelike, NaiveDate};
use serde::Serialize;

use crate::calendar::{self, LunarDate};
use crate::model::{CalendarKind, DateRule};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub date: NaiveDate,
    /// 这次落在哪一年（公历条目为公历年，农历条目为农历年），用于算岁数和周年。
    pub cycle_year: i32,
}

impl Occurrence {
    /// 第几个周年 / 几岁。未填起始年份时为 None。
    pub fn count(&self, rule: &DateRule) -> Option<i32> {
        rule.year.map(|y| self.cycle_year - y)
    }
}

/// 规则在 `year` 这一年（农历规则为农历年）对应的公历日期。
pub fn occurrence_in_year(rule: &DateRule, year: i32) -> Option<NaiveDate> {
    match rule.calendar {
        CalendarKind::Solar => {
            let max = calendar::solar_month_days(year, rule.month)?;
            NaiveDate::from_ymd_opt(year, rule.month, rule.day.min(max))
        }
        CalendarKind::Lunar => {
            let leap = rule.leap && calendar::leap_month_of(year) == Some(rule.month);
            let days = calendar::lunar_month_days(year, rule.month, leap)?;
            calendar::lunar_to_solar(LunarDate {
                year,
                month: rule.month,
                day: rule.day.min(days),
                leap,
            })
        }
    }
}

/// `from` 当天或之后的第一次。超出支持范围时返回 None。
pub fn next_occurrence(rule: &DateRule, from: NaiveDate) -> Option<Occurrence> {
    // 农历年在公历年初才开始，所以从 from 所在农历年算起；公历直接用公历年。
    let start = match rule.calendar {
        CalendarKind::Solar => from.year(),
        CalendarKind::Lunar => calendar::solar_to_lunar(from)?.year,
    };
    let start = rule.year.map_or(start, |y| start.max(y));
    for year in start..start + 3 {
        if !calendar::in_range(year) {
            return None;
        }
        if let Some(date) = occurrence_in_year(rule, year) {
            if date >= from {
                return Some(Occurrence { date, cycle_year: year });
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use CalendarKind::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    fn rule(calendar: CalendarKind, month: u32, day: u32, leap: bool, year: Option<i32>) -> DateRule {
        DateRule { calendar, month, day, leap, year }
    }

    #[test]
    fn solar_basic() {
        let r = rule(Solar, 10, 26, false, Some(1990));
        let o = next_occurrence(&r, d(2026, 10, 10)).unwrap();
        assert_eq!(o.date, d(2026, 10, 26));
        assert_eq!(o.count(&r), Some(36));
        // 当天算“今天”
        assert_eq!(next_occurrence(&r, d(2026, 10, 26)).unwrap().date, d(2026, 10, 26));
        // 过了就是明年
        let o = next_occurrence(&r, d(2026, 10, 27)).unwrap();
        assert_eq!(o.date, d(2027, 10, 26));
        assert_eq!(o.count(&r), Some(37));
    }

    #[test]
    fn solar_feb_29() {
        let r = rule(Solar, 2, 29, false, Some(2000));
        assert_eq!(next_occurrence(&r, d(2026, 1, 1)).unwrap().date, d(2026, 2, 28));
        assert_eq!(next_occurrence(&r, d(2028, 1, 1)).unwrap().date, d(2028, 2, 29));
        // 平年 3 月 1 日之后，下一次是 2027-02-28
        assert_eq!(next_occurrence(&r, d(2026, 3, 1)).unwrap().date, d(2027, 2, 28));
    }

    #[test]
    fn lunar_basic() {
        // 农历九月初六：2026 年是 10 月 15 日
        let r = rule(Lunar, 9, 6, false, Some(1966));
        let o = next_occurrence(&r, d(2026, 10, 10)).unwrap();
        assert_eq!(o.date, d(2026, 10, 15));
        assert_eq!(o.cycle_year, 2026);
        assert_eq!(o.count(&r), Some(60));
    }

    #[test]
    fn lunar_in_january_belongs_to_previous_lunar_year() {
        // 腊月廿一：农历 2025 年的腊月廿一 = 2026-02-08
        let r = rule(Lunar, 12, 21, false, None);
        let o = next_occurrence(&r, d(2026, 1, 15)).unwrap();
        assert_eq!(o.date, d(2026, 2, 8));
        assert_eq!(o.cycle_year, 2025);
        // 过了之后是农历 2026 年腊月廿一（2027 年 1 月或 2 月）
        let o = next_occurrence(&r, d(2026, 2, 9)).unwrap();
        assert_eq!(o.cycle_year, 2026);
        assert!(o.date.year() == 2027);
    }

    #[test]
    fn lunar_leap_month_rules() {
        // 闰四月初八出生（2020 年有闰四月）
        let leap = rule(Lunar, 4, 8, true, Some(2020));
        // 2026 年没有闰四月 → 过普通四月初八
        let normal_2026 = occurrence_in_year(&rule(Lunar, 4, 8, false, None), 2026).unwrap();
        assert_eq!(occurrence_in_year(&leap, 2026), Some(normal_2026));
        // 2020 年当年 → 闰四月初八 = 2020-05-30
        assert_eq!(occurrence_in_year(&leap, 2020), Some(d(2020, 5, 30)));
        // 普通四月初八在 2020 年是 2020-04-30，不受闰月影响
        assert_eq!(occurrence_in_year(&rule(Lunar, 4, 8, false, None), 2020), Some(d(2020, 4, 30)));
        // 2025 年闰六月：闰六月十五条目落在闰月，普通六月十五落在普通月
        let l = occurrence_in_year(&rule(Lunar, 6, 15, true, None), 2025).unwrap();
        let n = occurrence_in_year(&rule(Lunar, 6, 15, false, None), 2025).unwrap();
        assert_eq!((l - n).num_days(), calendar::lunar_month_days(2025, 6, false).unwrap() as i64);
    }

    #[test]
    fn lunar_day_30_falls_back() {
        // 除夕：农历 2025 年腊月只有 29 天 → 2026-02-16
        let r = rule(Lunar, 12, 30, false, None);
        assert_eq!(occurrence_in_year(&r, 2025), Some(d(2026, 2, 16)));
        // 农历 2024 年腊月有 30 天 → 2025-01-28
        assert_eq!(occurrence_in_year(&r, 2024), Some(d(2025, 1, 28)));
    }

    #[test]
    fn respects_start_year() {
        // 2028 年才结婚，不会算出 2026、2027 年的日期
        let r = rule(Solar, 5, 20, false, Some(2028));
        let o = next_occurrence(&r, d(2026, 10, 10)).unwrap();
        assert_eq!(o.date, d(2028, 5, 20));
        assert_eq!(o.count(&r), Some(0));
    }

    #[test]
    fn end_of_range() {
        let r = rule(Solar, 1, 1, false, None);
        assert_eq!(next_occurrence(&r, d(2099, 6, 1)), None);
    }
}
