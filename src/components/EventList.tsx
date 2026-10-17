import { CATEGORY_LABELS, daysLabel, groupUpcoming, shortDate } from '../format';
import type { DayEvent, Upcoming } from '../types';
import { CATEGORY_ICONS, Icon } from './Icon';

interface Props {
  today: string;
  upcoming: Upcoming[];
  events: Map<string, DayEvent>;
  filtered: boolean;
  onOpen: (event: DayEvent) => void;
  onToggle: (event: DayEvent) => void;
  onPrepared: (event: DayEvent, prepared: boolean) => void;
  onClearFilter: () => void;
}

export function EventList({ today, upcoming, events, filtered, onOpen, onToggle, onPrepared, onClearFilter }: Props) {
  if (upcoming.length === 0) {
    return (
      <div className="no-match">
        <Icon name="search" size={22} />
        <p>{filtered ? '没有符合条件的记录' : '暂无记录'}</p>
        {filtered && (
          <button className="btn ghost small" onClick={onClearFilter}>
            清除筛选
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="sections">
      {groupUpcoming(upcoming).map((section) => (
        <section key={section.key} className={`section section-${section.key}`}>
          <h2 className="section-title">
            {section.title}
            <span className="section-count">{section.items.length}</span>
          </h2>
          <ul className="rows">
            {section.items.map((u) => {
              const event = events.get(u.eventId)!;
              const tone = u.daysUntil === 0 ? 'is-today' : u.daysUntil <= 7 ? 'is-soon' : u.daysUntil <= 30 ? 'is-month' : '';
              // 一个月内可以标记“已准备”；当天再标意义不大，但之前标过的要能看到和取消
              const canPrepare = u.prepared || (event.enabled && u.daysUntil >= 1 && u.daysUntil <= 30);
              return (
                <li key={u.eventId} className={`row ${event.enabled ? '' : 'disabled'} ${u.prepared ? 'prepared' : ''}`}>
                  <button className="row-main" onClick={() => onOpen(event)} title="点击编辑">
                    <span className={`days ${tone}`}>
                      {u.daysUntil <= 2 ? (
                        <strong className="days-word">{daysLabel(u.daysUntil)}</strong>
                      ) : (
                        <>
                          <strong>{u.daysUntil}</strong>
                          <small>天</small>
                        </>
                      )}
                    </span>
                    <span className="row-body">
                      <span className="row-title">
                        <span className="row-name">{event.name}</span>
                        <span className={`tag tag-${event.category}`}>
                          <Icon name={CATEGORY_ICONS[event.category]} size={12} />
                          {CATEGORY_LABELS[event.category]}
                        </span>
                        {u.countLabel && <span className="count">{u.countLabel}</span>}
                        {!event.enabled && <span className="tag tag-off">已停用</span>}
                      </span>
                      <span className="row-meta">
                        <span>
                          {shortDate(u.date, today)} {u.weekday}
                        </span>
                        {u.lunarLabel && <span>农历{u.lunarLabel}</span>}
                        <span className="rule">每年{u.ruleLabel}</span>
                      </span>
                      {event.note && <span className="row-note">{event.note}</span>}
                    </span>
                  </button>
                  <div className="row-actions">
                    {canPrepare && (
                      <button
                        className={`btn chip ${u.prepared ? 'chip-on' : ''}`}
                        onClick={() => onPrepared(event, !u.prepared)}
                        title={u.prepared ? '取消“已准备”，恢复提前提醒' : '礼物和安排都定了：之后的提前提醒不再打扰，当天仍会提醒'}
                        aria-pressed={u.prepared}
                      >
                        <Icon name="gift" size={14} />
                        {u.prepared ? '已准备' : '标记已准备'}
                      </button>
                    )}
                    <label className="switch" title={event.enabled ? '提醒已开启，点击停用' : '提醒已关闭，点击开启'}>
                      <input
                        type="checkbox"
                        checked={event.enabled}
                        onChange={() => onToggle(event)}
                        aria-label={`${event.name}的提醒`}
                      />
                      <span />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
