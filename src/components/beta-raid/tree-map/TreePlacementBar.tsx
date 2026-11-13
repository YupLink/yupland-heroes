import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLang, useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { TREE_PLANT_ENERGY } from "@/lib/treePlant";
import { treePlacement } from "./treePlacement";
import "./tree-placement.css";

import { thumb } from "@/lib/image";
// Shared dialogs, HUD sheets, Radix menus and legacy full-screen sheets.
// The map host itself is excluded: it is also fixed/inset-0 in fullscreen.
function hasOpenWindow(bar: HTMLElement | null) {
  return [...document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-hud-modal-panel], [data-radix-popper-content-wrapper], .fixed.inset-0'
  )].some(el => {
    if (el.contains(bar) || el.closest('[hidden], [inert]')) return false;
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      style.pointerEvents !== "none" && rect.width > 0 && rect.height > 0;
  });
}
function TreePlacementBarView() {
  const state = useSyncExternalStore(treePlacement.subscribe, treePlacement.get, () => null);
  const ru = useLang() === "ru", t = useT(), ref = useRef<HTMLElement>(null);
  const active = !!state;
  useLayoutEffect(() => {
    if (!active) return;
    const bar = ref.current;
    if (!bar) return;
    let frame = 0;
    const update = () => { frame = 0; const hidden = hasOpenWindow(ref.current); if (bar.hidden !== hidden) bar.hidden = hidden; };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "hidden", "inert", "open", "data-state"] });
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [active]);
  useLayoutEffect(() => {
    const bar = ref.current, host = bar?.parentElement;
    if (!bar || !host) return;
    const layout = () => {
      if (bar.hidden) return;
      const rect = host.getBoundingClientRect();
      bar.style.width = `${Math.min(420, rect.width - 16)}px`;
      const b = bar.getBoundingClientRect();
      let top = 8;
      host.querySelectorAll<HTMLElement>("[data-hud-top]").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > b.left && r.left < b.right) top = Math.max(top, r.bottom - rect.top + 8);
      });
      bar.style.top = `${top}px`;
      // Keep the game's right-hand map/action menu available on narrow screens.
      let width = Math.min(420, rect.width - 16);
      host.querySelectorAll<HTMLElement>("[data-hud-right]").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width && r.bottom > rect.top + top && r.top < rect.top + top + bar.offsetHeight && r.left > b.left)
          width = Math.min(width, r.left - b.left - 8);
      });
      bar.style.width = `${Math.max(180, width)}px`;
    };
    const ro = new ResizeObserver(layout);
    ro.observe(host);
    ro.observe(bar);
    host.querySelectorAll<HTMLElement>("[data-hud-top]").forEach(el => ro.observe(el));
    host.querySelectorAll<HTMLElement>("[data-hud-right]").forEach(el => ro.observe(el));
    layout();
    return () => ro.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !hasOpenWindow(ref.current) && treePlacement.stop()) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [active]);
  if (!state) return null;
  const busy = state.phase === "planting" || state.phase === "syncing";
  const words: Record<string, string> = {
    loading: ru ? "Проверяем доступные клетки…" : "Checking available cells…",
    planting: ru ? "Сажаем дерево…" : "Planting…",
    syncing: ru ? "Обновляем рюкзак и энергию…" : "Updating backpack and energy…",
    uncertain: ru ? "Нет ответа. Посадка могла пройти или завершиться позже. Проверь дерево и запас." : "No response. Planting may have succeeded or may finish later. Check the tree and stock.",
    load_error: ru ? "Не удалось проверить клетки и запас." : "Could not check cells and inventory.",
    sync_error: ru ? "Не удалось обновить данные посадки." : "Could not refresh planting data.",
    retry_moved: ru ? "Герой переместился. Итог посадки неизвестен. Можно завершить без повтора." : "Hero moved. The planting result is unknown. You can finish without retrying.",
    energy: ru ? `Нужно ${TREE_PLANT_ENERGY} энергии на дерево.` : `${TREE_PLANT_ENERGY} energy needed per tree.`,
    no_cells: ru ? "Рядом нет свободных клеток. Перейди на другое место." : "No free cells nearby. Move to another spot.",
    blocked: ru ? "Здесь нельзя посадить дерево." : "Cannot plant here.",
    position_changed: ru ? "Герой сменил клетку. Проверь место посадки." : "Hero moved. Check the planted location.",
  };
  const message = state.phase === "loading" || busy ? words[state.phase]
    : state.message ? words[state.message] ?? serverErrorText(new Error(state.message), t)
    : ru ? "Нажми на клетку с +, чтобы посадить" : "Tap a cell with + to plant";
  return <section ref={ref} className="tree-placement-bar" aria-label={ru ? "Посадка деревьев" : "Tree planting"}>
    <div className="tree-placement-bar__row">
      {state.item.image && <img src={thumb(state.item.image, 96)} alt="" />}
      <div className="tree-placement-bar__item"><strong>{state.item.name}</strong>
        <span aria-live="polite">{ru ? "Осталось" : "Remaining"}: <b>{state.count ?? "…"}</b></span></div>
      <button type="button" onClick={() => treePlacement.stop()} disabled={busy}>{ru ? "Завершить" : "Finish"}</button>
    </div>
    <div className="tree-placement-bar__help"><span className="tree-placement-bar__cost"><img src="/resources/energy.webp" alt={ru ? "Энергия" : "Energy"} />{TREE_PLANT_ENERGY}</span>
      <span role="status">{message}</span></div>
    {(state.phase === "error" || state.phase === "uncertain") && <button type="button" className="tree-placement-bar__retry" onClick={() => treePlacement.retry()}>{ru ? "Проверить и продолжить" : "Check and continue"}</button>}
    {state.phase === "uncertain" && <button type="button" className="tree-placement-bar__retry" onClick={() => void treePlacement.finishWithoutRetry()}>{ru ? "Завершить без повтора" : "Finish without retry"}</button>}
  </section>;
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const TreePlacementBar = memo(TreePlacementBarView);
