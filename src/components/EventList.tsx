import { CATEGORY_LABELS, daysLabel, groupUpcoming, shortDate } from '../format';
import type { DayEvent, Upcoming } from '../types';

interface Props {
  today: string;
  upcoming: Upcoming[];
  events: Map<string, DayEvent>;
  filtered: boolean;
  onOpen: (event: DayEvent) => void;
  onToggle: (event: DayEvent) => void;
}

export function EventList({ today, upcoming, events, filtered, onOpen, onToggle }: Props) {
  if (upcoming.length === 0) {
    return <p className="no-match">{filtered ? '没有符合条件的记录' : '暂无记录'}</p>;
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
              return (
                <li key={u.eventId} className={`row ${event.enabled ? '' : 'disabled'}`}>
                  <button className="row-main" onClick={() => onOpen(event)}>
                    <span className={`days ${u.daysUntil === 0 ? 'is-today' : u.daysUntil <= 7 ? 'is-soon' : ''}`}>
                      {u.daysUntil <= 2 ? (
                        <strong>{daysLabel(u.daysUntil)}</strong>
                      ) : (
                        <>
                          <strong>{u.daysUntil}</strong>
                          <small>天</small>
                        </>
                      )}
                    </span>
                    <span className="row-body">
                      <span className="row-title">
                        {event.name}
                        <span className={`tag tag-${event.category}`}>{CATEGORY_LABELS[event.category]}</span>
                        {u.countLabel && <span className="count">{u.countLabel}</span>}
                      </span>
                      <span className="row-meta">
                        {shortDate(u.date, today)} {u.weekday}
                        {u.lunarLabel && <> · 农历{u.lunarLabel}</>}
                        <span className="rule"> · 每年{u.ruleLabel}</span>
                      </span>
                      {event.note && <span className="row-note">{event.note}</span>}
                    </span>
                  </button>
                  <label className="switch" title={event.enabled ? '提醒已开启' : '提醒已关闭'}>
                    <input
                      type="checkbox"
                      checked={event.enabled}
                      onChange={() => onToggle(event)}
                      aria-label={`${event.name}的提醒`}
                    />
                    <span />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
