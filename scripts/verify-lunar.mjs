// 用 lunar-javascript 逐日对照 daymark-core 的农历换算。
// 用法：cargo run -q -p daymark-core --example dump_lunar > /tmp/lunar.txt && node scripts/verify-lunar.mjs /tmp/lunar.txt
import { readFileSync } from 'node:fs';
import { Solar } from 'lunar-javascript';

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n');
let mismatches = 0;
for (const line of lines) {
  const [date, y, m, d, leap] = line.split(' ');
  const [sy, sm, sd] = date.split('-').map(Number);
  const lunar = Solar.fromYmd(sy, sm, sd).getLunar();
  const month = lunar.getMonth();
  const expected = `${lunar.getYear()} ${Math.abs(month)} ${lunar.getDay()} ${month < 0 ? 1 : 0}`;
  if (expected !== `${y} ${m} ${d} ${leap}`) {
    if (mismatches++ < 2000) console.log(`${date}: core=${y} ${m} ${d} ${leap} reference=${expected}`);
  }
}
console.log(`checked ${lines.length} days, ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
