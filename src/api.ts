import type {
  Category,
  DateRule,
  DayEvent,
  EventInput,
  ImportResult,
  LunarDate,
  Overview,
  RulePreview,
  Settings,
} from './types';

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 开发时在普通浏览器里打开，用内存假数据预览界面；正式构建会删掉这段
  if (import.meta.env.DEV && !inTauri()) {
    const { mockInvoke } = await import('./mock');
    return mockInvoke(cmd, args) as Promise<T>;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const api = {
  overview: () => call<Overview>('get_overview'),
  saveEvent: (id: string | null, input: EventInput) => call<DayEvent>('save_event', { id, input }),
  deleteEvent: (id: string) => call<void>('delete_event', { id }),
  setEnabled: (id: string, enabled: boolean) => call<void>('set_event_enabled', { id, enabled }),
  preview: (rule: DateRule, category: Category) => call<RulePreview>('preview_rule', { rule, category }),
  convertSolar: (date: string) => call<LunarDate>('convert_solar', { date }),
  updateSettings: (settings: Settings) => call<Settings>('update_settings', { settings }),
  exportData: (path: string) => call<void>('export_data', { path }),
  importData: (path: string) => call<ImportResult>('import_data', { path }),
  testNotification: () => call<void>('test_notification'),
};

/** 打开“保存”对话框，返回路径；浏览器预览时返回 null。 */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (!inTauri()) return null;
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({ defaultPath: defaultName, filters: [{ name: '刻忆数据', extensions: ['json'] }] });
}

export async function pickOpenPath(): Promise<string | null> {
  if (!inTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: '刻忆数据', extensions: ['json'] }] });
  return typeof path === 'string' ? path : null;
}

export function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return '操作失败，请重试';
}
