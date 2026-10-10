import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { CATEGORY_LABELS, LUNAR_DAYS, LUNAR_MONTHS, offsetLabel, shortDate, solarMaxDay } from '../format';
import type { Category, DayEvent, EventInput, RulePreview } from '../types';
import { Modal } from './Modal';

interface Props {
  event: DayEvent | null;
  defaultOffsets: number[];
  offsetChoices: number[];
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES: Category[] = ['birthday', 'anniversary', 'memorial', 'festival', 'other'];

function initial(event: DayEvent | null, defaultOffsets: number[]): EventInput {
  if (event) {
    const { id: _id, createdAt: _c, updatedAt: _u, remindFrom: _r, ...input } = event;
    return input;
  }
  return {
    name: '',
    category: 'birthday',
    calendar: 'solar',
    month: 1,
    day: 1,
    leap: false,
    year: null,
    offsets: [...defaultOffsets],
    note: '',
    enabled: true,
  };
}

export function EventEditor({ event, defaultOffsets, offsetChoices, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EventInput>(() => initial(event, defaultOffsets));
  const [yearText, setYearText] = useState(event?.year != null ? String(event.year) : '');
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [solarHelper, setSolarHelper] = useState('');

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const lunar = form.calendar === 'lunar';
  const maxDay = lunar ? 30 : solarMaxDay(form.month);

  // 实时预览下一次日期
  useEffect(() => {
    const { calendar, month, day, leap, year, category } = form;
    const timer = setTimeout(() => {
      api
        .preview({ calendar, month, day, leap, year }, category)
        .then(setPreview)
        .catch((e) => setPreview({ error: errorText(e), ruleLabel: '', next: null, originDate: null }));
    }, 120);
    return () => clearTimeout(timer);
  }, [form.calendar, form.month, form.day, form.leap, form.year, form.category]);

  const setCalendar = (calendar: 'solar' | 'lunar') =>
    setForm((f) => ({
      ...f,
      calendar,
      leap: calendar === 'lunar' ? f.leap : false,
      day: Math.min(f.day, calendar === 'lunar' ? 30 : solarMaxDay(f.month)),
    }));

  const setMonth = (month: number) =>
    setForm((f) => ({ ...f, month, day: Math.min(f.day, f.calendar === 'lunar' ? 30 : solarMaxDay(month)) }));

  const setYear = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 4);
    setYearText(clean);
    set('year', clean.length === 4 ? Number(clean) : null);
  };

  const toggleOffset = (o: number) =>
    set('offsets', form.offsets.includes(o) ? form.offsets.filter((x) => x !== o) : [...form.offsets, o]);

  const applySolarDate = async () => {
    if (!solarHelper) return;
    try {
      const l = await api.convertSolar(solarHelper);
      setForm((f) => ({ ...f, calendar: 'lunar', month: l.month, day: l.day, leap: l.leap, year: l.year }));
      setYearText(String(l.year));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const save = async () => {
    if (yearText && yearText.length !== 4) {
      setError('年份请填写 4 位数字，或留空');
      return;
    }
    setSaving(true);
    try {
      await api.saveEvent(event?.id ?? null, form);
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    try {
      await api.deleteEvent(event.id);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const next = preview?.next;

  return (
    <Modal
      title={event ? '编辑' : '添加重要日子'}
      onClose={onClose}
      footer={
        <>
          {event &&
            (confirmDelete ? (
              <button className="btn danger" onClick={remove}>
                确认删除
              </button>
            ) : (
              <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                删除
              </button>
            ))}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="label">名称</span>
          <input
            autoFocus
            value={form.name}
            maxLength={40}
            placeholder="例如：妈妈生日、结婚纪念日"
            onChange={(e) => set('name', e.target.value)}
          />
        </label>

        <div className="field">
          <span className="label">类型</span>
          <div className="segmented">
            {CATEGORIES.map((c) => (
              <button key={c} className={form.category === c ? 'active' : ''} onClick={() => set('category', c)}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">日期</span>
          <div className="date-row">
            <div className="segmented">
              <button className={!lunar ? 'active' : ''} onClick={() => setCalendar('solar')}>
                公历
              </button>
              <button className={lunar ? 'active' : ''} onClick={() => setCalendar('lunar')}>
                农历
              </button>
            </div>
            <select value={form.month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="月">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {lunar ? LUNAR_MONTHS[i] : `${i + 1} 月`}
                </option>
              ))}
            </select>
            <select value={form.day} onChange={(e) => set('day', Number(e.target.value))} aria-label="日">
              {Array.from({ length: maxDay }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {lunar ? LUNAR_DAYS[i] : `${i + 1} 日`}
                </option>
              ))}
            </select>
            {lunar && (
              <label className="check">
                <input type="checkbox" checked={form.leap} onChange={(e) => set('leap', e.target.checked)} />
                闰月
              </label>
            )}
          </div>
        </div>

        <label className="field">
          <span className="label">起始年份</span>
          <span className="inline">
            <input
              className="year"
              inputMode="numeric"
              value={yearText}
              placeholder="可不填"
              onChange={(e) => setYear(e.target.value)}
            />
            <span className="hint">
              {lunar ? '农历年。' : ''}填了会显示岁数或周年{preview?.originDate ? `（${preview.originDate}）` : ''}
            </span>
          </span>
        </label>

        {lunar && (
          <div className="field">
            <span className="label">按公历换算</span>
            <span className="inline">
              <input type="date" value={solarHelper} min="1901-01-01" max="2099-12-31" onChange={(e) => setSolarHelper(e.target.value)} />
              <button className="btn ghost small" onClick={applySolarDate} disabled={!solarHelper}>
                换算成农历
              </button>
              <span className="hint">只记得公历出生日期时用</span>
            </span>
          </div>
        )}

        <div className={`preview ${preview?.error ? 'bad' : ''}`} aria-live="polite">
          {preview?.error
            ? preview.error
            : next
              ? (
                  <>
                    下一次：<strong>{shortDate(next.date, '0000')}</strong> {next.weekday}
                    {lunar ? '' : next.lunarLabel ? ` · 农历${next.lunarLabel}` : ''}
                    {' · '}
                    {next.daysUntil === 0 ? '就是今天' : `还有 ${next.daysUntil} 天`}
                    {next.countLabel ? ` · ${next.countLabel}` : ''}
                  </>
                )
              : '正在计算…'}
        </div>

        <div className="field">
          <span className="label">提醒</span>
          <div className="checks">
            {offsetChoices.map((o) => (
              <label key={o} className="check">
                <input type="checkbox" checked={form.offsets.includes(o)} onChange={() => toggleOffset(o)} />
                {offsetLabel(o)}
              </label>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">备注</span>
          <textarea
            rows={2}
            maxLength={500}
            value={form.note}
            placeholder="喜好、尺码、去年送了什么……"
            onChange={(e) => set('note', e.target.value)}
          />
        </label>

        <label className="check field-inline">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          开启提醒
        </label>

        {error && <p className="form-error">{error}</p>}
      </div>
    </Modal>
  );
}
