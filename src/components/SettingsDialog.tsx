import { useState } from 'react';
import { api, errorText, pickOpenPath, pickSavePath } from '../api';
import { offsetLabel } from '../format';
import type { Settings } from '../types';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  dataPath: string;
  offsetChoices: number[];
  onClose: () => void;
  onChanged: () => void;
}

export function SettingsDialog({ settings, dataPath, offsetChoices, onClose, onChanged }: Props) {
  const [form, setForm] = useState<Settings>(settings);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleOffset = (o: number) =>
    setForm((f) => ({
      ...f,
      defaultOffsets: f.defaultOffsets.includes(o) ? f.defaultOffsets.filter((x) => x !== o) : [...f.defaultOffsets, o],
    }));

  const run = async (fn: () => Promise<string | null>) => {
    try {
      const text = await fn();
      if (text) setMessage({ text });
    } catch (e) {
      setMessage({ text: errorText(e), bad: true });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSettings(form);
      onChanged();
      onClose();
    } catch (e) {
      setMessage({ text: errorText(e), bad: true });
      setSaving(false);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      title="设置"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            保存
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="label">每日提醒时间</span>
          <span className="inline">
            <input type="time" value={form.remindTime} onChange={(e) => setForm({ ...form, remindTime: e.target.value })} />
            <span className="hint">到点后弹出当天该发的提醒；开机晚于这个时间会立即补发</span>
          </span>
        </label>

        <label className="check field-inline">
          <input type="checkbox" checked={form.autostart} onChange={(e) => setForm({ ...form, autostart: e.target.checked })} />
          开机自动启动（只在托盘运行，不弹窗口）
        </label>

        <div className="field">
          <span className="label">新建时默认提醒</span>
          <div className="checks">
            {offsetChoices.map((o) => (
              <label key={o} className="check">
                <input type="checkbox" checked={form.defaultOffsets.includes(o)} onChange={() => toggleOffset(o)} />
                {offsetLabel(o)}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">通知</span>
          <span className="inline">
            <button
              className="btn ghost small"
              onClick={() => run(async () => (await api.testNotification(), '已发送测试通知，请看屏幕右下角'))}
            >
              发送测试通知
            </button>
            <span className="hint">收不到时，请检查 Windows“通知”设置和专注助手</span>
          </span>
        </div>

        <div className="field">
          <span className="label">数据</span>
          <span className="inline">
            <button
              className="btn ghost small"
              onClick={() =>
                run(async () => {
                  const path = await pickSavePath(`刻忆备份-${stamp}.json`);
                  if (!path) return null;
                  await api.exportData(path);
                  return `已导出到 ${path}`;
                })
              }
            >
              导出备份
            </button>
            <button
              className="btn ghost small"
              onClick={() =>
                run(async () => {
                  const path = await pickOpenPath();
                  if (!path) return null;
                  const r = await api.importData(path);
                  onChanged();
                  return `导入完成：新增 ${r.added} 条，更新 ${r.updated} 条${r.skipped ? `，跳过 ${r.skipped} 条无效记录` : ''}`;
                })
              }
            >
              导入
            </button>
          </span>
          <span className="hint path">数据文件：{dataPath}</span>
        </div>

        {message && <p className={message.bad ? 'form-error' : 'form-ok'}>{message.text}</p>}
      </div>
    </Modal>
  );
}
