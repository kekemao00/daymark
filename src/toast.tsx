import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icon';

export interface ToastOptions {
  text: string;
  kind?: 'info' | 'success' | 'danger';
  /** 可选操作，如“撤销”。点击后关闭。 */
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface Toast extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = ++seq.current;
      // 同一时间最多 3 条，新的顶掉最旧的
      setToasts((list) => [...list.slice(-2), { ...opts, id }]);
      const duration = opts.duration ?? (opts.action ? 6000 : 3200);
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`} role="status">
            <Icon name={t.kind === 'danger' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={15} />
            <span className="toast-text">{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="关闭">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
