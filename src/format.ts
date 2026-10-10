import type { Category, DayEvent, Upcoming } from './types';

export const CATEGORY_LABELS: Record<Category, string> = {
  birthday: '生日',
  anniversary: '纪念日',
  memorial: '忌日',
  festival: '节日',
  other: '其他',
};

export const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
export const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 公历每月最多天数（2 月按 29 天，允许录入 2 月 29 日）。 */
export function solarMaxDay(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

export function offsetLabel(offset: number): string {
  if (offset === 0) return '当天';
  if (offset === 30) return '提前 1 个月';
  if (offset === 7) return '提前 1 周';
  return `提前 ${offset} 天`;
}

export function daysLabel(days: number): string {
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  return `${days} 天`;
}

/** "2026-10-15" → "10月15日"，跨年时带年份。 */
export function shortDate(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return sameYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

export type Section = { key: string; title: string; items: Upcoming[] };

/** 首页分组：今天、7 天内、30 天内、更晚。 */
export function groupUpcoming(list: Upcoming[]): Section[] {
  const groups: Section[] = [
    { key: 'today', title: '今天', items: [] },
    { key: 'week', title: '7 天内', items: [] },
    { key: 'month', title: '30 天内', items: [] },
    { key: 'later', title: '更晚', items: [] },
  ];
  for (const u of list) {
    const g = u.daysUntil === 0 ? 0 : u.daysUntil <= 7 ? 1 : u.daysUntil <= 30 ? 2 : 3;
    groups[g].items.push(u);
  }
  return groups.filter((g) => g.items.length > 0);
}

export type Filter = 'all' | 'birthday' | 'anniversary' | 'others';

export function matches(event: DayEvent, filter: Filter, query: string): boolean {
  if (filter === 'birthday' && event.category !== 'birthday') return false;
  if (filter === 'anniversary' && event.category !== 'anniversary') return false;
  if (filter === 'others' && (event.category === 'birthday' || event.category === 'anniversary')) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return event.name.toLowerCase().includes(q) || event.note.toLowerCase().includes(q);
}
