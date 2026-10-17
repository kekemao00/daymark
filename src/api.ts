import type {
  Category,
  DateRule,
  DayEvent,
  DownloadProgress,
  EventInput,
  ImportResult,
  LunarDate,
  Overview,
  RulePreview,
  Settings,
  UpdateInfo,
} from './types';

export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
// 常量而不是函数：正式构建里 DEV 为 false，整个 mock 分支连同 mock.ts 都会被删掉
const USE_MOCK = import.meta.env.DEV && !inTauri();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 开发时在普通浏览器里打开，用内存假数据预览界面；正式构建会删掉这段
  if (USE_MOCK) {
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
  restoreEvent: (event: DayEvent) => call<void>('restore_event', { event }),
  setEnabled: (id: string, enabled: boolean) => call<void>('set_event_enabled', { id, enabled }),
  setPrepared: (id: string, prepared: boolean) => call<void>('set_event_prepared', { id, prepared }),
  preview: (rule: DateRule, category: Category) => call<RulePreview>('preview_rule', { rule, category }),
  convertSolar: (date: string) => call<LunarDate>('convert_solar', { date }),
  updateSettings: (settings: Settings) => call<Settings>('update_settings', { settings }),
  exportData: (path: string) => call<void>('export_data', { path }),
  importData: (path: string) => call<ImportResult>('import_data', { path }),
  testNotification: () => call<void>('test_notification'),
  revealDataFile: () => call<void>('reveal_data_file'),
  openProjectUrl: (url: string) => call<void>('open_project_url', { url }),
  checkUpdate: (force: boolean) => call<UpdateInfo | null>('check_update', { force }),
  installUpdate: () => call<void>('install_update'),
};

/** Rust 端推送的事件。 */
export interface AppEvents {
  'update://result': UpdateInfo | null;
  'update://progress': DownloadProgress;
  'update://installing': void;
  'update://error': string;
}

/** 监听 Rust 端事件，返回取消函数。浏览器预览时接到 mock 的事件总线。 */
export function onEvent<K extends keyof AppEvents>(name: K, handler: (payload: AppEvents[K]) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  (async () => {
    if (USE_MOCK) {
      const { mockEvents } = await import('./mock');
      unlisten = mockEvents.on(name, handler as (p: unknown) => void);
    } else {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<AppEvents[K]>(name, (e) => handler(e.payload));
    }
    if (cancelled) unlisten();
  })();
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

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
