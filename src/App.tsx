import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from './api';
import { EventEditor } from './components/EventEditor';
import { EventList } from './components/EventList';
import { SettingsDialog } from './components/SettingsDialog';
import { type Filter, matches } from './format';
import type { DayEvent, Overview } from './types';

type Editing = { mode: 'new' } | { mode: 'edit'; event: DayEvent } | null;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'birthday', label: '生日' },
  { key: 'anniversary', label: '纪念日' },
  { key: 'others', label: '其他' },
];

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const o = await api.overview();
      setOverview(o);
      if (o.notice) setNotice(o.notice);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    // 窗口重新获得焦点时刷新（可能已跨过零点）
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const eventsById = useMemo(() => new Map(overview?.events.map((e) => [e.id, e]) ?? []), [overview]);
  const visible = useMemo(
    () =>
      (overview?.upcoming ?? []).filter((u) => {
        const e = eventsById.get(u.eventId);
        return e && matches(e, filter, query);
      }),
    [overview, eventsById, filter, query],
  );

  if (!overview) {
    return <div className="loading">{error ?? '正在加载…'}</div>;
  }

  const empty = overview.events.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ♥
          </span>
          <span className="brand-name">刻忆</span>
        </div>
        {!empty && (
          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder="搜索名称或备注"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
          <button className="btn primary" onClick={() => setEditing({ mode: 'new' })}>
            ＋ 添加
          </button>
        </div>
      </header>

      {notice && (
        <div className="banner" role="status">
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice(null)}>
            知道了
          </button>
        </div>
      )}
      {error && (
        <div className="banner danger" role="alert">
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
              ♥
            </div>
            <h1>把重要的日子交给刻忆</h1>
            <p>生日、纪念日只需录入一次。农历会自动换算成每年的公历日期，提前一个月、一周和当天都会弹出提醒。</p>
            <button className="btn primary large" onClick={() => setEditing({ mode: 'new' })}>
              添加第一个重要日子
            </button>
          </div>
        ) : (
          <EventList
            today={overview.today}
            upcoming={visible}
            events={eventsById}
            onOpen={(event) => setEditing({ mode: 'edit', event })}
            onToggle={async (event) => {
              try {
                await api.setEnabled(event.id, !event.enabled);
                await refresh();
              } catch (e) {
                setError(errorText(e));
              }
            }}
            filtered={filter !== 'all' || query.trim() !== ''}
          />
        )}
      </main>

      <footer className="footer">
        关闭窗口后，刻忆会留在系统托盘继续按时提醒（每天 {overview.settings.remindTime} 起）。
      </footer>

      {editing && (
        <EventEditor
          key={editing.mode === 'edit' ? editing.event.id : 'new'}
          event={editing.mode === 'edit' ? editing.event : null}
          defaultOffsets={overview.settings.defaultOffsets}
          offsetChoices={overview.offsetChoices}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={overview.settings}
          dataPath={overview.dataPath}
          offsetChoices={overview.offsetChoices}
          onClose={() => setSettingsOpen(false)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
