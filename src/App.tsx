import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText, onEvent } from './api';
import { EventEditor } from './components/EventEditor';
import { EventList } from './components/EventList';
import { BrandMark, Icon } from './components/Icon';
import { SettingsDialog } from './components/SettingsDialog';
import { UpdateBanner, type UpdatePhase } from './components/UpdateBanner';
import { type Filter, matches, summarize, todayLabel } from './format';
import { applyTheme, useHotkeys } from './hooks';
import { useToast } from './toast';
import type { DayEvent, DownloadProgress, Overview, UpdateInfo } from './types';

type Editing = { mode: 'new' } | { mode: 'edit'; event: DayEvent } | null;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'birthday', label: '生日' },
  { key: 'anniversary', label: '纪念日' },
  { key: 'others', label: '其他' },
];

const SNOOZE_KEY = 'daymark.updateSnoozed';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function isSnoozed(version: string): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const { version: v, until } = JSON.parse(raw) as { version: string; until: number };
    return v === version && until > Date.now();
  } catch {
    return false;
  }
}

function snooze(version: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: Date.now() + SNOOZE_MS }));
  } catch {
    // 私密模式等情况下存不了，忽略
  }
}

export default function App() {
  const toast = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // 应用内更新
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateHidden, setUpdateHidden] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>('available');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const o = await api.overview();
      setOverview(o);
      applyTheme(o.settings.theme);
      if (o.notice) setNotice(o.notice);
      setError(null);
      return o;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().then((o) => {
      if (o?.settings.checkUpdates) api.checkUpdate(false).catch(() => {});
    });
    // 窗口重新获得焦点时刷新（可能已跨过零点）
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  useEffect(() => {
    const offs = [
      onEvent('update://result', (info) => {
        setUpdate(info);
        if (info) {
          setPhase('available');
          setUpdateHidden(isSnoozed(info.version));
        }
      }),
      onEvent('update://progress', (p) => {
        setPhase('downloading');
        setProgress(p);
      }),
      onEvent('update://installing', () => setPhase('installing')),
      onEvent('update://error', (msg) => toast.show({ text: msg, kind: 'danger' })),
    ];
    return () => offs.forEach((off) => off());
  }, [toast]);

  const installUpdate = async () => {
    setPhase('downloading');
    setProgress(null);
    setUpdateError(null);
    try {
      await api.installUpdate();
    } catch (e) {
      setPhase('error');
      setUpdateError(errorText(e));
    }
  };

  const openNew = useCallback(() => setEditing({ mode: 'new' }), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const modalOpen = editing !== null || settingsOpen;
  const hotkeys = useMemo(
    () =>
      [
        [{ key: 'n', ctrl: true }, openNew],
        [{ key: 'f', ctrl: true }, focusSearch],
        [{ key: '/' }, focusSearch],
        [{ key: ',', ctrl: true }, openSettings],
      ] as [{ key: string; ctrl?: boolean }, () => void][],
    [openNew, focusSearch, openSettings],
  );
  useHotkeys(hotkeys, !modalOpen);

  const eventsById = useMemo(() => new Map(overview?.events.map((e) => [e.id, e]) ?? []), [overview]);
  const visible = useMemo(
    () =>
      (overview?.upcoming ?? []).filter((u) => {
        const e = eventsById.get(u.eventId);
        return e && matches(e, filter, query);
      }),
    [overview, eventsById, filter, query],
  );
  const summary = useMemo(() => summarize(overview?.upcoming ?? [], eventsById), [overview, eventsById]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.show({ text: errorText(e), kind: 'danger' });
    }
  };

  const deleteEvent = async (event: DayEvent) => {
    setEditing(null);
    await act(() => api.deleteEvent(event.id));
    toast.show({
      text: `已删除「${event.name}」`,
      action: { label: '撤销', onClick: () => act(() => api.restoreEvent(event)) },
    });
  };

  if (!overview) {
    return <div className="loading">{error ?? '正在加载…'}</div>;
  }

  const empty = overview.events.length === 0;
  const filtered = filter !== 'all' || query.trim() !== '';
  const clearFilter = () => {
    setFilter('all');
    setQuery('');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">刻忆</span>
        </div>
        {!empty && (
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={15} />
              <input
                ref={searchRef}
                type="search"
                placeholder="搜索名称或备注"
                aria-label="搜索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), (e.target as HTMLInputElement).blur())}
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
                  <Icon name="x" size={13} />
                </button>
              )}
            </label>
            <div className="segmented" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  className={filter === f.key ? 'active' : ''}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="actions">
          <button className="btn ghost" onClick={openSettings} title="设置（Ctrl + ,）">
            <Icon name="sliders" size={15} />
            设置
          </button>
          <button className="btn primary" onClick={openNew} title="添加（Ctrl + N）">
            <Icon name="plus" size={15} />
            添加
          </button>
        </div>
      </header>

      {update && !updateHidden && (
        <UpdateBanner
          update={update}
          phase={phase}
          progress={progress}
          error={updateError}
          onInstall={installUpdate}
          onLater={() => {
            snooze(update.version);
            setUpdateHidden(true);
          }}
          onOpenNotes={() => api.openProjectUrl(update.url).catch((e) => toast.show({ text: errorText(e), kind: 'danger' }))}
        />
      )}
      {notice && (
        <div className="banner" role="status">
          <Icon name="info" size={15} />
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice(null)}>
            知道了
          </button>
        </div>
      )}
      {error && (
        <div className="banner danger" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>
            关闭
          </button>
        </div>
      )}

      <main className="content">
        {empty ? (
          <div className="empty">
            <div className="empty-mark" aria-hidden>
              <BrandMark size={44} />
            </div>
            <h1>把重要的日子交给刻忆</h1>
            <p>生日、纪念日只需录入一次。农历会自动换算成每年的公历日期，提前一个月、一周和当天都会弹出提醒。</p>
            <button className="btn primary large" onClick={openNew}>
              <Icon name="plus" size={16} />
              添加第一个重要日子
            </button>
            <p className="empty-hint">
              已有备份？到<button className="link" onClick={openSettings}>设置</button>里导入
            </p>
          </div>
        ) : (
          <>
            <div className="overview">
              <div className="today">
                <span className="today-date">{todayLabel(overview.today)}</span>
                {overview.todayLunar && <span className="today-lunar">农历{overview.todayLunar}</span>}
              </div>
              <ul className="stats" aria-label="概览">
                <li className={summary.today ? 'hot' : ''}>
                  <strong>{summary.today}</strong>今天
                </li>
                <li className={summary.week ? 'warm' : ''}>
                  <strong>{summary.week}</strong>7 天内
                </li>
                <li>
                  <strong>{summary.month}</strong>30 天内
                </li>
                <li className="muted">
                  共 <strong>{summary.total}</strong> 条
                </li>
              </ul>
            </div>
            <EventList
              today={overview.today}
              upcoming={visible}
              events={eventsById}
              filtered={filtered}
              onOpen={(event) => setEditing({ mode: 'edit', event })}
              onToggle={(event) => act(() => api.setEnabled(event.id, !event.enabled))}
              onPrepared={(event, prepared) =>
                act(async () => {
                  await api.setPrepared(event.id, prepared);
                  if (prepared) toast.show({ text: `「${event.name}」已标记为准备好了，当天仍会提醒`, kind: 'success' });
                })
              }
              onClearFilter={clearFilter}
            />
          </>
        )}
      </main>

      <footer className="footer">
        <span>关闭窗口后，刻忆会留在系统托盘继续按时提醒（每天 {overview.settings.remindTime} 起）。</span>
        <span className="footer-version">v{overview.version}</span>
      </footer>

      {editing && (
        <EventEditor
          key={editing.mode === 'edit' ? editing.event.id : 'new'}
          event={editing.mode === 'edit' ? editing.event : null}
          defaultOffsets={overview.settings.defaultOffsets}
          offsetChoices={overview.offsetChoices}
          onClose={() => setEditing(null)}
          onSaved={async (saved, created) => {
            setEditing(null);
            await refresh();
            toast.show({ text: created ? `已添加「${saved.name}」` : `已保存「${saved.name}」`, kind: 'success' });
          }}
          onDelete={deleteEvent}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={overview.settings}
          dataPath={overview.dataPath}
          offsetChoices={overview.offsetChoices}
          version={overview.version}
          releasesUrl={overview.releasesUrl}
          update={update}
          onClose={() => setSettingsOpen(false)}
          onChanged={refresh}
          onShowUpdate={() => {
            setSettingsOpen(false);
            setUpdateHidden(false);
          }}
        />
      )}
    </div>
  );
}
