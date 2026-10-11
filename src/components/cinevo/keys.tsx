import { useEffect } from "react";
import { useCinevo } from "@/lib/cinevo-store";
import { THEMES } from "@/lib/library";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function moveFocus(key: string) {
  const nodes = [...document.querySelectorAll<HTMLElement>("button, a[href], input, select")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 8 && box.height > 8 && !el.hasAttribute("disabled");
  });
  if (!nodes.length) return;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : nodes[0];
  const origin = current.getBoundingClientRect();
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of nodes) {
    if (el === current) continue;
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const forward = key === "ArrowRight" ? dx : key === "ArrowLeft" ? -dx : key === "ArrowDown" ? dy : -dy;
    if (forward < 8) continue;
    const side = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const score = forward + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  (best || nodes[0]).focus();
}

export function Keys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useCinevo.getState();
      if (s.playingId) {
        if (e.key === "Escape" || e.key === "Backspace") s.stopPlay();
        if (document.documentElement.dataset.tv === "1") {
          if (e.key === "MediaPlayPause" || e.key === " ") s.togglePlay();
          if (e.key === "ArrowLeft") s.setProgress(s.playingId, Math.max(0, (s.progress[s.playingId] ?? 0) - 2));
          if (e.key === "ArrowRight") s.setProgress(s.playingId, Math.min(100, (s.progress[s.playingId] ?? 0) + 2));
        }
        return;
      }
      if (document.documentElement.dataset.tv === "1" && !isTyping(e.target)) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          moveFocus(e.key);
          return;
        }
        if ((e.key === "Enter" || e.key === " ") && document.activeElement instanceof HTMLElement) {
          e.preventDefault();
          document.activeElement.click();
          return;
        }
      }
      if (e.key === "Escape") {
        if (!s.house.onboarded) {
          s.finishOnboarding();
          return;
        }
        if (s.searchOpen) s.setSearchOpen(false);
        else if (s.settingsOpen) s.setSettingsOpen(false);
        else if (s.coreOpen) s.setCoreOpen(false);
        else if (s.noticesOpen) s.setNoticesOpen(false);
        else if (s.selectedId) s.closeTitle();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        s.setSearchOpen(true);
      }
      if (e.key === "t" || e.key === "T") {
        if (s.searchOpen || s.settingsOpen || s.coreOpen || s.selectedId) return;
        const i = THEMES.findIndex((th) => th.id === s.prefs.theme);
        const next = THEMES[(i + 1) % THEMES.length];
        s.setTheme(next.id);
        s.flash(`${next.label} theme`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
