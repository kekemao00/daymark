// 与 daymark-core 的 serde 结构一一对应（camelCase）。

export type Category = 'birthday' | 'anniversary' | 'memorial' | 'festival' | 'other';
export type CalendarKind = 'solar' | 'lunar';

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
}

export interface Upcoming {
  eventId: string;
  date: string; // YYYY-MM-DD
  daysUntil: number;
  weekday: string;
  lunarLabel: string | null;
  ruleLabel: string;
  countLabel: string | null;
}

export interface Settings {
  remindTime: string;
  autostart: boolean;
  defaultOffsets: number[];
}

export interface Overview {
  today: string;
  events: DayEvent[];
  upcoming: Upcoming[];
  settings: Settings;
  notice: string | null;
  dataPath: string;
  offsetChoices: number[];
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
