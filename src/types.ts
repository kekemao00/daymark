// 与 daymark-core 的 serde 结构一一对应（camelCase）。

export type Category = 'birthday' | 'anniversary' | 'memorial' | 'festival' | 'other';
export type CalendarKind = 'solar' | 'lunar';
export type Theme = 'system' | 'light' | 'dark';

export interface DateRule {
  calendar: CalendarKind;
  month: number;
  day: number;
  leap: boolean;
  year: number | null;
}

export interface EventInput extends DateRule {
  name: string;
  category: Category;
  offsets: number[];
  note: string;
  enabled: boolean;
}

export interface DayEvent extends EventInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  remindFrom: string;
  /** 已为哪一次（YYYY-MM-DD）做好准备；没有则不含此字段。 */
  prepared?: string | null;
}

export interface Upcoming {
  eventId: string;
  date: string; // YYYY-MM-DD
  daysUntil: number;
  weekday: string;
  lunarLabel: string | null;
  ruleLabel: string;
  countLabel: string | null;
  prepared: boolean;
}

export interface Settings {
  remindTime: string;
  autostart: boolean;
  defaultOffsets: number[];
  checkUpdates: boolean;
  theme: Theme;
}

export interface Overview {
  today: string;
  todayLunar: string | null;
  events: DayEvent[];
  upcoming: Upcoming[];
  settings: Settings;
  notice: string | null;
  dataPath: string;
  offsetChoices: number[];
  version: string;
  releasesUrl: string;
}

export interface RulePreview {
  error: string | null;
  ruleLabel: string;
  next: Upcoming | null;
  originDate: string | null;
}

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  leap: boolean;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
  url: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}
