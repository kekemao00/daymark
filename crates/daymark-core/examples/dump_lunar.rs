//! 输出 1901-01-01 至 2099-12-31 每一天的农历（公历日期 农历年 月 日 是否闰月），
//! 供 scripts/verify-lunar.mjs 与 lunar-javascript 逐日对照。同时校验农历→公历往返一致。

use chrono::NaiveDate;
use daymark_core::calendar::{lunar_to_solar, solar_to_lunar};
use std::io::Write;

fn main() {
    let mut out = std::io::BufWriter::new(std::io::stdout());
    let mut day = NaiveDate::from_ymd_opt(1901, 1, 1).unwrap();
    let end = NaiveDate::from_ymd_opt(2099, 12, 31).unwrap();
    while day <= end {
        let l = solar_to_lunar(day).expect("in range");
        assert_eq!(lunar_to_solar(l), Some(day), "round trip failed for {day}");
        writeln!(out, "{day} {} {} {} {}", l.year, l.month, l.day, l.leap as u8).unwrap();
        day = day.succ_opt().unwrap();
    }
}
