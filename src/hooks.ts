import { useEffect } from 'react';
import type { Theme } from './types';

type Combo = { key: string; ctrl?: boolean; shift?: boolean };
type Hotkey = [Combo, () => void];

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/**
 * 全局快捷键。带 Ctrl 的组合在输入框里也生效；不带 Ctrl 的（如 `/`）在输入时忽略。
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      for (const [combo, run] of hotkeys) {
        const ctrl = combo.ctrl ?? false;
        if (e.key.toLowerCase() !== combo.key.toLowerCase()) continue;
        if ((e.ctrlKey || e.metaKey) !== ctrl || e.shiftKey !== (combo.shift ?? false) || e.altKey) continue;
        if (!ctrl && isTyping(e.target)) continue;
        e.preventDefault();
        run();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys, enabled]);
}

/** 把主题写到 <html data-theme>，CSS 据此切换；system 时交给系统偏好。 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
