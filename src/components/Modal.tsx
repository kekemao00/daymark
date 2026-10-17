import { type ReactNode, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface Props {
  title: string;
  /** 标题下方一行说明。 */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 对话框：Esc 或点遮罩关闭；打开时把焦点移进来，关闭后还给原来的元素；Tab 不会跑到对话框外面。
 */
export function Modal({ title, subtitle, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    // 优先聚焦第一个输入框，没有就聚焦对话框本身
    const first = dialog?.querySelector<HTMLElement>('input:not([type="checkbox"]), select, textarea') ?? dialog;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">{footer}</footer>
      </div>
    </div>
  );
}
