// 仅开发预览用：在普通浏览器里打开界面时，用内存数据模拟 Rust 命令。正式构建不包含此文件。
// 日期计算用 lunar-javascript 近似实现，规则以 daymark-core 为准。
import { Lunar, LunarYear, Solar } from 'lunar-javascript';
import type { Category, DateRule, DayEvent, EventInput, Overview, Settings, Upcoming } from './types';
import { LUNAR_DAYS, LUNAR_MONTHS } from './format';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayIso = () => new URLSearchParams(location.search).get('today') ?? iso(new Date());

function occurrence(rule: DateRule, year: number): Date | null {
  if (rule.calendar === 'solar') {
    const max = new Date(year, rule.month, 0).getDate();
    return new Date(year, rule.month - 1, Math.min(rule.day, max));
  }
  const ly = LunarYear.fromYear(year);
  const leap = rule.leap && ly.getLeapMonth() === rule.month;
  const month = ly.getMonth(leap ? -rule.month : rule.month);
  if (!month) return null;
  const s = Lunar.fromYmd(year, leap ? -rule.month : rule.month, Math.min(rule.day, month.getDayCount())).getSolar();
  return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
}

function next(rule: DateRule, from: Date) {
  const start =
    rule.calendar === 'solar'
      ? from.getFullYear()
      : Solar.fromYmd(from.getFullYear(), from.getMonth() + 1, from.getDate()).getLunar().getYear();
  for (let y = Math.max(start, rule.year ?? 0); y < start + 3; y++) {
    const d = occurrence(rule, y);
    if (d && d >= from) return { date: d, cycleYear: y };
  }
  return null;
}

function lunarLabel(d: Date) {
  const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
  const m = l.getMonth();
  return `${m < 0 ? '闰' : ''}${LUNAR_MONTHS[Math.abs(m) - 1]}${LUNAR_DAYS[l.getDay() - 1]}`;
}

function ruleLabel(r: DateRule) {
  return r.calendar === 'solar'
    ? `公历 ${r.month}月${r.day}日`
    : `农历${r.leap ? '闰' : ''}${LUNAR_MONTHS[r.month - 1]}${LUNAR_DAYS[r.day - 1]}`;
}

function upcomingFor(e: { id: string; category: Category } & DateRule): Upcoming | null {
  const today = parse(todayIso());
  const n = next(e, today);
  if (!n) return null;
  const count = e.year != null ? n.cycleYear - e.year : null;
  const countLabel =
    count == null || count < 1 || e.category === 'festival'
      ? null
      : e.category === 'birthday'
        ? `${count} 岁生日`
        : e.category === 'other'
          ? `第 ${count} 年`
          : `${count} 周年`;
  return {
    eventId: e.id,
    date: iso(n.date),
    daysUntil: Math.round((n.date.getTime() - today.getTime()) / 864e5),
    weekday: WEEK[n.date.getDay()],
    lunarLabel: lunarLabel(n.date),
    ruleLabel: ruleLabel(e),
    countLabel,
  };
}

let seq = 0;
const now = new Date().toISOString();
const make = (input: EventInput): DayEvent => ({
  ...input,
  id: `mock-${++seq}`,
  createdAt: now,
  updatedAt: now,
  remindFrom: todayIso(),
});
const base = { leap: false, offsets: [30, 7, 0], note: '', enabled: true };

let settings: Settings = { remindTime: '09:00', autostart: true, defaultOffsets: [30, 7, 0] };
let events: DayEvent[] = new URLSearchParams(location.search).has('empty')
  ? []
  : [
      make({ ...base, name: '妈妈生日', category: 'birthday', calendar: 'lunar', month: 9, day: 6, year: 1966, note: '喜欢兰花，提前订好蛋糕' }),
      make({ ...base, name: '结婚纪念日', category: 'anniversary', calendar: 'solar', month: 10, day: 18, year: 2019 }),
      make({ ...base, name: '爸爸生日', category: 'birthday', calendar: 'lunar', month: 12, day: 21, year: 1963 }),
      make({ ...base, name: '小雨生日', category: 'birthday', calendar: 'solar', month: 10, day: 10, year: 1995, note: '大学室友' }),
      make({ ...base, name: '奶奶忌日', category: 'memorial', calendar: 'lunar', month: 3, day: 12, year: 2015, offsets: [7, 0] }),
      make({ ...base, name: '王总生日', category: 'birthday', calendar: 'solar', month: 11, day: 2, year: null, note: '客户，送茶叶', enabled: false }),
    ];

export async function mockInvoke(cmd: string, args: Record<string, any> = {}): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 30));
  switch (cmd) {
    case 'get_overview': {
      const upcoming = events
        .map(upcomingFor)
        .filter((u): u is Upcoming => !!u)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      const o: Overview = {
        today: todayIso(),
        events,
        upcoming,
        settings,
        notice: null,
        dataPath: 'C:\\Users\\you\\AppData\\Roaming\\app.daymark.desktop\\daymark.json',
        offsetChoices: [30, 7, 3, 1, 0],
      };
      return structuredClone(o);
    }
    case 'save_event': {
      const input = args.input as EventInput;
      if (!input.name.trim()) throw '请填写名称';
      if (args.id) {
        events = events.map((e) => (e.id === args.id ? { ...e, ...input, updatedAt: new Date().toISOString() } : e));
        return events.find((e) => e.id === args.id);
      }
      const e = make(input);
      events.push(e);
      return e;
    }
    case 'delete_event':
      events = events.filter((e) => e.id !== args.id);
      return null;
    case 'set_event_enabled':
      events = events.map((e) => (e.id === args.id ? { ...e, enabled: args.enabled } : e));
      return null;
    case 'preview_rule': {
      const rule = args.rule as DateRule;
      return { error: null, ruleLabel: ruleLabel(rule), next: upcomingFor({ ...rule, id: '', category: args.category }), originDate: null };
    }
    case 'convert_solar': {
      const [y, m, d] = (args.date as string).split('-').map(Number);
      const l = Solar.fromYmd(y, m, d).getLunar();
      return { year: l.getYear(), month: Math.abs(l.getMonth()), day: l.getDay(), leap: l.getMonth() < 0 };
    }
    case 'update_settings':
      settings = args.settings;
      return settings;
    case 'test_notification':
      return null;
    default:
      throw `浏览器预览不支持：${cmd}`;
  }
}
