//! 公历与农历之间的换算，基于内置的农历 1900–2099 年数据表（见 lunar_table.rs）。
//! 数据表与香港天文台农历表一致，scripts/verify-lunar.mjs 逐日对照验证。

use std::sync::OnceLock;

use chrono::{Datelike, NaiveDate};
use serde::Serialize;

use crate::lunar_table::{FIRST_NEW_YEAR, FIRST_YEAR, LAST_YEAR, YEAR_INFO};

/// 支持的年份范围。农历换算已在此范围内逐日对照验证。
pub const MIN_YEAR: i32 = 1901;
pub const MAX_YEAR: i32 = 2099;

pub const LUNAR_MONTH_NAMES: [&str; 12] = [
    "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月",
];

pub const LUNAR_DAY_NAMES: [&str; 30] = [
    "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二",
    "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四",
    "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

pub const WEEKDAY_NAMES: [&str; 7] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/// 一个农历日期。`year` 是农历年（正月初一换年）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LunarDate {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub leap: bool,
}

impl LunarDate {
    /// 例如“闰四月初八”。
    pub fn label(&self) -> String {
        format!("{}{}", month_name(self.month, self.leap), day_name(self.day))
    }
}

pub fn month_name(month: u32, leap: bool) -> String {
    let base = LUNAR_MONTH_NAMES[(month as usize).clamp(1, 12) - 1];
    if leap {
        format!("闰{base}")
    } else {
        base.to_string()
    }
}

pub fn day_name(day: u32) -> &'static str {
    LUNAR_DAY_NAMES[(day as usize).clamp(1, 30) - 1]
}

pub fn weekday_name(date: NaiveDate) -> &'static str {
    WEEKDAY_NAMES[date.weekday().num_days_from_monday() as usize]
}

pub fn in_range(year: i32) -> bool {
    (MIN_YEAR..=MAX_YEAR).contains(&year)
}

/// 数据表覆盖的农历年（比 in_range 多出农历 1900 年，用于 1901 年初的日期）。
fn in_table(year: i32) -> bool {
    (FIRST_YEAR..=LAST_YEAR).contains(&year)
}

/// 一个农历年里按顺序排列的月份：(月, 是否闰月, 天数)。
fn months_of(year: i32) -> Option<Vec<(u32, bool, u32)>> {
    if !(FIRST_YEAR..=LAST_YEAR).contains(&year) {
        return None;
    }
    let info = YEAR_INFO[(year - FIRST_YEAR) as usize];
    let leap = (info >> 13) & 0xf;
    let mut months = Vec::with_capacity(13);
    let mut i = 0;
    for m in 1..=12u32 {
        months.push((m, false, if info & (1 << i) != 0 { 30 } else { 29 }));
        i += 1;
        if m == leap {
            months.push((m, true, if info & (1 << i) != 0 { 30 } else { 29 }));
            i += 1;
        }
    }
    Some(months)
}

/// 每个农历年正月初一的公历日期，下标 0 是 FIRST_YEAR，最后多一项是 LAST_YEAR 的下一年。
fn new_years() -> &'static [NaiveDate] {
    static CACHE: OnceLock<Vec<NaiveDate>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let (y, m, d) = FIRST_NEW_YEAR;
        let mut date = NaiveDate::from_ymd_opt(y, m, d).expect("valid table start");
        let mut list = vec![date];
        for year in FIRST_YEAR..=LAST_YEAR {
            let days: u32 = months_of(year).unwrap().iter().map(|m| m.2).sum();
            date += chrono::Duration::days(days as i64);
            list.push(date);
        }
        list
    })
}

/// 公历转农历。超出支持范围（公历 1901–2099 年）时返回 None。
pub fn solar_to_lunar(date: NaiveDate) -> Option<LunarDate> {
    if !in_range(date.year()) {
        return None;
    }
    let ny = new_years();
    // 最后一个不晚于 date 的正月初一
    let idx = ny.partition_point(|d| *d <= date).checked_sub(1)?;
    let year = FIRST_YEAR + idx as i32;
    let mut offset = (date - ny[idx]).num_days() as u32;
    for (month, leap, days) in months_of(year)? {
        if offset < days {
            return Some(LunarDate { year, month, day: offset + 1, leap });
        }
        offset -= days;
    }
    None
}

/// 某个农历年的闰月（1–12），没有闰月返回 None。
pub fn leap_month_of(year: i32) -> Option<u32> {
    if !in_table(year) {
        return None;
    }
    match (YEAR_INFO[(year - FIRST_YEAR) as usize] >> 13) & 0xf {
        0 => None,
        m => Some(m),
    }
}

/// 某个农历月的天数（29 或 30）。月份不存在（如该年没有这个闰月）时返回 None。
pub fn lunar_month_days(year: i32, month: u32, leap: bool) -> Option<u32> {
    if !in_table(year) {
        return None;
    }
    months_of(year)?
        .into_iter()
        .find(|m| m.0 == month && m.1 == leap)
        .map(|m| m.2)
}

/// 精确的农历转公历：日期必须真实存在，否则返回 None。
pub fn lunar_to_solar(date: LunarDate) -> Option<NaiveDate> {
    if !in_table(date.year) {
        return None;
    }
    let mut offset = 0u32;
    for (month, leap, days) in months_of(date.year)? {
        if month == date.month && leap == date.leap {
            if date.day < 1 || date.day > days {
                return None;
            }
            let ny = new_years()[(date.year - FIRST_YEAR) as usize];
            return Some(ny + chrono::Duration::days((offset + date.day - 1) as i64));
        }
        offset += days;
    }
    None
}

/// 公历某月的天数。
pub fn solar_month_days(year: i32, month: u32) -> Option<u32> {
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let next = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)?
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)?
    };
    Some((next - first).num_days() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn known_new_years() {
        // 春节：2024-02-10、2025-01-29、2026-02-17
        for (y, date) in [(2024, d(2024, 2, 10)), (2025, d(2025, 1, 29)), (2026, d(2026, 2, 17))] {
            let lunar = LunarDate { year: y, month: 1, day: 1, leap: false };
            assert_eq!(lunar_to_solar(lunar), Some(date));
            assert_eq!(solar_to_lunar(date), Some(lunar));
        }
    }

    #[test]
    fn leap_months() {
        assert_eq!(leap_month_of(2020), Some(4));
        assert_eq!(leap_month_of(2023), Some(2));
        assert_eq!(leap_month_of(2025), Some(6));
        assert_eq!(leap_month_of(2026), None);
        // 2033 年闰十一月（著名的“2033 年问题”）
        assert_eq!(leap_month_of(2033), Some(11));
        // 2025 闰六月初一 = 2025-07-25
        let leap = LunarDate { year: 2025, month: 6, day: 1, leap: true };
        assert_eq!(lunar_to_solar(leap), Some(d(2025, 7, 25)));
        assert_eq!(solar_to_lunar(d(2025, 7, 25)), Some(leap));
        assert_eq!(leap.label(), "闰六月初一");
    }

    #[test]
    fn invalid_lunar_dates() {
        // 2026 年没有闰月
        assert_eq!(lunar_to_solar(LunarDate { year: 2026, month: 6, day: 1, leap: true }), None);
        // 2025 年腊月只有 29 天（除夕是腊月廿九）
        assert_eq!(lunar_month_days(2025, 12, false), Some(29));
        assert_eq!(lunar_to_solar(LunarDate { year: 2025, month: 12, day: 30, leap: false }), None);
        assert_eq!(
            lunar_to_solar(LunarDate { year: 2025, month: 12, day: 29, leap: false }),
            Some(d(2026, 2, 16))
        );
    }

    #[test]
    fn matches_hong_kong_observatory_where_libraries_disagree() {
        // 这几个月份各开源库互有分歧，以香港天文台农历表为准
        for (date, month) in [(d(1906, 4, 24), 4), (d(1957, 3, 2), 2), (d(2089, 9, 4), 8), (d(2097, 8, 7), 7)] {
            let l = solar_to_lunar(date).unwrap();
            assert_eq!((l.month, l.day, l.leap), (month, 1, false), "{date}");
        }
    }

    #[test]
    fn out_of_range() {
        assert_eq!(solar_to_lunar(d(1800, 1, 1)), None);
        // 1901 年元旦属于农历 1900 年冬月
        let l = solar_to_lunar(d(1901, 1, 1)).unwrap();
        assert_eq!((l.year, l.month), (1900, 11));
        assert_eq!(lunar_to_solar(l), Some(d(1901, 1, 1)));
        assert_eq!(leap_month_of(2200), None);
        assert_eq!(leap_month_of(1900), Some(8));
    }
}
