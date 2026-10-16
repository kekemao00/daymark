import { formatBytes } from '../format';
import type { DownloadProgress, UpdateInfo } from '../types';
import { Icon } from './Icon';

export type UpdatePhase = 'available' | 'downloading' | 'installing' | 'error';

interface Props {
  update: UpdateInfo;
  phase: UpdatePhase;
  progress: DownloadProgress | null;
  error: string | null;
  onInstall: () => void;
  onLater: () => void;
  onOpenNotes: () => void;
}

export function UpdateBanner({ update, phase, progress, error, onInstall, onLater, onOpenNotes }: Props) {
  const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;
  return (
    <div className={`update-banner phase-${phase}`} role="status">
      <Icon name={phase === 'error' ? 'alert' : 'rocket'} size={18} className="update-icon" />
      <div className="update-text">
        {phase === 'available' && (
          <>
            <strong>刻忆 {update.version} 已发布</strong>
            <span className="update-sub">
              当前 {update.currentVersion}
              {update.date ? ` · ${update.date}` : ''} · 下载后自动安装并重启，数据不受影响
            </span>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <strong>正在下载 {update.version}</strong>
            <span className="update-sub">
              {progress
                ? `${formatBytes(progress.downloaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`
                : '正在连接 GitHub…'}
            </span>
            <span className="progress" aria-hidden>
              <span className={`progress-bar ${percent == null ? 'indeterminate' : ''}`} style={percent != null ? { width: `${percent}%` } : undefined} />
            </span>
          </>
        )}
        {phase === 'installing' && (
          <>
            <strong>正在安装 {update.version}</strong>
            <span className="update-sub">安装程序会接管，几秒后刻忆自动重新打开</span>
          </>
        )}
        {phase === 'error' && (
          <>
            <strong>更新没有完成</strong>
            <span className="update-sub">{error}</span>
          </>
        )}
      </div>
      <div className="update-actions">
        {(phase === 'available' || phase === 'error') && (
          <>
            <button className="btn ghost small" onClick={onOpenNotes}>
              <Icon name="external" size={14} />
              更新说明
            </button>
            <button className="btn ghost small" onClick={onLater}>
              稍后
            </button>
            <button className="btn primary small" onClick={onInstall}>
              <Icon name="download" size={14} />
              {phase === 'error' ? '重试' : '立即更新'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
