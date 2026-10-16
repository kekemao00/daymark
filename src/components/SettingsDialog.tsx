import { useEffect, useState } from 'react';
import { api, errorText, pickOpenPath, pickSavePath } from '../api';
import { offsetLabel } from '../format';
import { applyTheme } from '../hooks';
import type { Settings, Theme, UpdateInfo } from '../types';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  dataPath: string;
  offsetChoices: number[];
  version: string;
  releasesUrl: string;
  /** 当前已知的新版本（由 App 维护）。 */
  update: UpdateInfo | null;
  onClose: () => void;
  onChanged: () => void;
  onShowUpdate: () => void;
}

const THEMES: { key: Theme; label: string; icon: IconName }[] = [
  { key: 'system', label: '跟随系统', icon: 'monitor' },
  { key: 'light', label: '浅色', icon: 'sun' },
  { key: 'dark', label: '深色', icon: 'moon' },
];

export function SettingsDialog({ settings, dataPath, offsetChoices, version, releasesUrl, update, onClose, onChanged, onShowUpdate }: Props) {
  const [form, setForm] = useState<Settings>(settings);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  // 主题即选即生效；取消时恢复原来的
  useEffect(() => {
    applyTheme(form.theme);
  }, [form.theme]);
  useEffect(() => () => applyTheme(settings.theme), [settings.theme]);

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

  const checkNow = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const info = await api.checkUpdate(true);
      setCheckResult(info ? `发现新版本 ${info.version}` : `已是最新版本（${version}）`);
    } catch (e) {
      setCheckResult(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      title="设置"
      onClose={onClose}
      wide
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
      <div className="form settings">
        <section className="settings-section">
          <h3>
            <Icon name="bell" size={15} />
            提醒
          </h3>
          <label className="field">
            <span className="label">每日提醒时间</span>
            <span className="inline">
              <input type="time" value={form.remindTime} onChange={(e) => setForm({ ...form, remindTime: e.target.value })} />
              <span className="hint">到点后弹出当天该发的提醒；开机晚于这个时间会立即补发</span>
            </span>
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
        </section>

        <section className="settings-section">
          <h3>
            <Icon name="monitor" size={15} />
            启动与外观
          </h3>
          <label className="check field-inline">
            <input type="checkbox" checked={form.autostart} onChange={(e) => setForm({ ...form, autostart: e.target.checked })} />
            开机自动启动（只在托盘运行，不弹窗口）
          </label>
          <div className="field">
            <span className="label">主题</span>
            <div className="segmented" role="radiogroup" aria-label="主题">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  role="radio"
                  aria-checked={form.theme === t.key}
                  className={form.theme === t.key ? 'active' : ''}
                  onClick={() => setForm({ ...form, theme: t.key })}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>
            <Icon name="rocket" size={15} />
            关于与更新
          </h3>
          <div className="field">
            <span className="label">版本</span>
            <span className="inline">
              <span className="version">刻忆 {version}</span>
              {update ? (
                <button className="btn primary small" onClick={onShowUpdate}>
                  <Icon name="download" size={14} />
                  更新到 {update.version}
                </button>
              ) : (
                <button className="btn ghost small" onClick={checkNow} disabled={checking}>
                  <Icon name="refresh" size={14} className={checking ? 'spin' : ''} />
                  {checking ? '正在检查…' : '检查更新'}
                </button>
              )}
              <button className="btn link-btn" onClick={() => run(async () => (await api.openProjectUrl(releasesUrl), null))}>
                <Icon name="external" size={13} />
                更新日志
              </button>
              {checkResult && <span className="hint">{checkResult}</span>}
            </span>
          </div>
          <label className="check field-inline">
            <input type="checkbox" checked={form.checkUpdates} onChange={(e) => setForm({ ...form, checkUpdates: e.target.checked })} />
            自动检查更新（打开窗口时和每隔几小时从 GitHub 检查一次，发现新版本只提示、不会自动安装）
          </label>
        </section>

        <section className="settings-section">
          <h3>
            <Icon name="folder" size={15} />
            数据
          </h3>
          <div className="field">
            <span className="label">备份</span>
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
                <Icon name="export" size={14} />
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
                <Icon name="import" size={14} />
                导入
              </button>
              <button className="btn ghost small" onClick={() => run(async () => (await api.revealDataFile(), null))}>
                <Icon name="folder" size={14} />
                打开数据目录
              </button>
            </span>
            <span className="hint path">换电脑时导出再导入，同一条目按修改时间合并。数据文件：{dataPath}</span>
          </div>
        </section>

        {message && (
          <p className={message.bad ? 'form-error' : 'form-ok'}>
            <Icon name={message.bad ? 'alert' : 'check'} size={14} />
            {message.text}
          </p>
        )}
      </div>
    </Modal>
  );
}
