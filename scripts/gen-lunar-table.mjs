// 由 lunar-javascript 生成 daymark-core 内置的农历数据表（农历 1900–2099 年）。
// lunar-javascript 与香港天文台农历表在 1906、1957、2089、2097 等有分歧的月份一致，
// 而 tyme4rs、chinese-lunisolar-calendar 在这些月份各有偏差，所以选它作为数据来源。
// 用法：node scripts/gen-lunar-table.mjs > crates/daymark-core/src/lunar_table.rs
import { LunarYear, Lunar } from 'lunar-javascript';

const FIRST = 1900;
const LAST = 2099;
const rows = [];
for (let y = FIRST; y <= LAST; y++) {
  const year = LunarYear.fromYear(y);
  const months = year.getMonthsInYear(); // 按顺序，包含闰月
  let bits = 0;
  months.forEach((m, i) => {
    if (m.getDayCount() === 30) bits |= 1 << i;
  });
  const leap = year.getLeapMonth();
  if (months.length !== (leap ? 13 : 12)) throw new Error(`unexpected month count in ${y}`);
  rows.push({ y, value: (leap << 13) | bits });
}
const ny = Lunar.fromYmd(FIRST, 1, 1).getSolar();
const pad = (n) => String(n).padStart(2, '0');

const out = [];
out.push('//! 自动生成，请勿手改：node scripts/gen-lunar-table.mjs > crates/daymark-core/src/lunar_table.rs');
out.push('//!');
out.push('//! 每个农历年一个 u32：低 13 位按月份顺序（含闰月）标记大月（30 天），第 13–16 位是闰月（0 表示无闰月）。');
out.push('');
out.push(`pub const FIRST_YEAR: i32 = ${FIRST};`);
out.push(`pub const LAST_YEAR: i32 = ${LAST};`);
out.push(`/// 农历 ${FIRST} 年正月初一的公历日期。`);
out.push(`pub const FIRST_NEW_YEAR: (i32, u32, u32) = (${ny.getYear()}, ${ny.getMonth()}, ${ny.getDay()});`);
out.push('');
out.push(`pub const YEAR_INFO: [u32; ${rows.length}] = [`);
for (let i = 0; i < rows.length; i += 8) {
  const chunk = rows.slice(i, i + 8).map((r) => `0x${r.value.toString(16).padStart(5, '0')}`).join(', ');
  out.push(`    ${chunk}, // ${rows[i].y}`);
}
out.push('];');
console.log(out.join('\n'));
