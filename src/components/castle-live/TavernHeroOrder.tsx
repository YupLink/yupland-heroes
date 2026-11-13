import "./tavern-hero-order.css";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Columns2, Columns3, ListFilter, Pencil, Rows2, X } from "lucide-react";
import { RACES, metaLabel } from "@/components/heroMeta";
import { normalizeRace } from "@/lib/hero/heroStatSources";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { listMyHeroes } from "@/server/api/heroes-read";
import { useTavernPins } from "@/lib/hooks/useTavernPins";
import { TavernHeroCard } from "./TavernHeroCard";

type Hero = Awaited<ReturnType<typeof listMyHeroes>>[number];
const heroKey = (hero: Hero) => hero.itemId ? `item:${hero.itemId}` : hero.id ? `hero:${hero.id}` : `template:${hero.templateId}`;
const storageKey = (wallet: string | null) => wallet ? `yuplink:tavern-hero-order:v1:${wallet}` : null;
const gridKey = "yuplink:tavern-hero-grid:v1";

function readGridColumns(): 1 | 2 | 3 {
  if (typeof localStorage === "undefined") return 2;
  try {
    const saved = localStorage.getItem(gridKey);
    return saved === "1" ? 1 : saved === "3" ? 3 : 2;
  }
  catch { return 2; }
}

function readOrder(wallet: string | null): string[] {
  const key = storageKey(wallet);
  if (!key || typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((part): part is string => typeof part === "string") : [];
  } catch { return []; }
}

export function useTavernHeroOrder(rows: Hero[], activeHeroId: string | null, wallet: string | null) {
  const [saved, setSaved] = useState<string[]>(() => readOrder(wallet));
  // Закладки — на аккаунте (одни на всех устройствах), см. useTavernPins.
  const { pinnedKeys, togglePin: togglePinKey, saveError: pinSaveError } = useTavernPins(wallet);
  const [raceFilter, setRaceFilter] = useState("all");
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => { setSaved(readOrder(wallet)); setDraft(null); }, [wallet]);

  const positions = new Map(saved.map((key, index) => [key, index]));
  const allOrdered = rows.map((hero, index) => ({ hero, index }))
    .sort((a, b) => (positions.get(heroKey(a.hero)) ?? Infinity) - (positions.get(heroKey(b.hero)) ?? Infinity) || a.index - b.index)
    .map(({ hero }) => hero);
  const activeHero = activeHeroId ? allOrdered.find(hero => hero.id === activeHeroId) : null;
  const baseOtherHeroes = activeHero ? allOrdered.filter(hero => hero !== activeHero) : allOrdered;
  const otherHeroes = [
    ...baseOtherHeroes.filter(hero => pinnedKeys.has(heroKey(hero))),
    ...baseOtherHeroes.filter(hero => !pinnedKeys.has(heroKey(hero))),
  ];
  const visibleHeroes = raceFilter === "all" ? otherHeroes : otherHeroes.filter(hero => normalizeRace(hero.race) === raceFilter);
  const browsable = activeHero ? [activeHero, ...visibleHeroes] : visibleHeroes;
  const byKey = new Map(baseOtherHeroes.map(hero => [heroKey(hero), hero]));
  const draftKeys = draft === null ? null : [
    ...draft.filter(key => byKey.has(key)),
    ...baseOtherHeroes.map(heroKey).filter(key => !draft.includes(key)),
  ];
  const editHeroes = draftKeys?.map(key => byKey.get(key)).filter((hero): hero is Hero => !!hero) ?? [];

  const start = () => { setDraft(baseOtherHeroes.map(heroKey)); setSaveError(false); };
  const cancel = () => { setDraft(null); setSaveError(false); };
  const move = (key: string, target: number) => setDraft(current => {
    if (!current) return current;
    const next = [...current];
    const from = next.indexOf(key);
    if (from < 0) return current;
    next.splice(from, 1);
    next.splice(target, 0, key);
    return next;
  });
  const moveToHero = (key: string, targetKey: string) => {
    const target = editHeroes.findIndex(hero => heroKey(hero) === targetKey);
    if (target >= 0 && key !== targetKey) move(key, target);
  };
  const save = () => {
    if (!draftKeys) return;
    const next = allOrdered.map(hero => hero === activeHero ? heroKey(hero) : draftKeys.shift()!);
    const key = storageKey(wallet);
    if (!key) { setSaveError(true); return; }
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(next);
      setDraft(null);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  const togglePin = (hero: Hero) => togglePinKey(heroKey(hero));
  return { browsable, otherHeroes, visibleHeroes, editHeroes, editing: draft !== null, saveError, pinSaveError, raceFilter, setRaceFilter, pinnedKeys, togglePin, start, cancel, move, moveToHero, save };
}

export function TavernOtherHeroes({ order, ru, onOpen, onShowBusyField }: {
  order: ReturnType<typeof useTavernHeroOrder>;
  ru: boolean;
  onOpen: (hero: Hero) => void;
  onShowBusyField?: (q: number, r: number) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState<1 | 2 | 3>(2);
  useEffect(() => { setGridColumns(readGridColumns()); }, []);
  const nextGridColumns = gridColumns === 1 ? 2 : gridColumns === 2 ? 3 : 1;
  const nextGridLabel = ru
    ? nextGridColumns === 1 ? "Показать по одному герою в ряд" : `Показать по ${nextGridColumns} героя в ряд`
    : `Show ${nextGridColumns === 1 ? "one hero" : `${nextGridColumns} heroes`} per row`;
  const toggleGrid = () => {
    const next = nextGridColumns;
    setGridColumns(next);
    try { localStorage.setItem(gridKey, String(next)); } catch { /* Keep the choice for this visit. */ }
  };
  const drag = useRef<{ key: string; element: HTMLElement; startX: number; startY: number; x: number; y: number; lastY: number; scrollTop: number; mode: "pending" | "drag" | "scroll" } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const scrollHost = useRef<HTMLElement | null>(null);
  const movePreview = () => {
    const current = drag.current;
    if (!current) return;
    const dx = current.x - current.startX;
    const dy = current.y - current.startY + (scrollHost.current?.scrollTop ?? 0) - current.scrollTop;
    current.element.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.04)`;
  };
  const tileAt = (x: number, y: number) => {
    const current = drag.current;
    const grid = current?.element.parentElement;
    if (!current || !grid) return null;
    const bounds = grid.getBoundingClientRect();
    if (x < bounds.left - 24 || x > bounds.right + 24 || y < bounds.top - 24 || y > bounds.bottom + 24) return null;
    let closest: string | null = null;
    let distance = Infinity;
    for (const tile of grid.querySelectorAll<HTMLElement>("[data-hero-order-tile]")) {
      if (tile === current.element) continue;
      const rect = tile.getBoundingClientRect();
      const next = (x - (rect.left + rect.right) / 2) ** 2 + (y - (rect.top + rect.bottom) / 2) ** 2;
      if (next < distance) { distance = next; closest = tile.dataset.heroOrderTile ?? null; }
    }
    return closest;
  };
  const clearHold = () => { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; };
  const activateDrag = () => {
    const current = drag.current;
    if (!current || current.mode !== "pending") return;
    clearHold();
    current.mode = "drag";
    movePreview();
    setDragging(current.key);
  };
  const stopDrag = () => {
    clearHold();
    if (drag.current) drag.current.element.style.transform = "";
    drag.current = null;
    scrollHost.current = null;
    setDragging(null);
    setDropTarget(null);
  };
  useEffect(() => {
    if (!dragging) return;
    const timer = window.setInterval(() => {
      const host = scrollHost.current;
      const current = drag.current;
      if (!host || !current) return;
      const bounds = host.getBoundingClientRect();
      const step = current.y < bounds.top + 65 ? -14 : current.y > bounds.bottom - 65 ? 14 : 0;
      if (step) { host.scrollBy({ top: step }); movePreview(); setDropTarget(tileAt(current.x, current.y)); }
    }, 30);
    return () => window.clearInterval(timer);
  }, [dragging]);
  return <section data-other-heroes tabIndex={-1} aria-labelledby="other-heroes-title">
    <div data-hero-order-heading>
      <h2 id="other-heroes-title">{ru ? "Остальные герои" : "Other heroes"} <span>· {order.otherHeroes.length}</span></h2>
      <div data-hero-view-actions>
        {!order.editing && order.otherHeroes.length > 0 && <Select value={order.raceFilter} onValueChange={order.setRaceFilter}>
          <SelectTrigger data-hero-race-trigger data-filter-active={order.raceFilter !== "all" || undefined} aria-label={ru ? `Фильтр по расе: ${order.raceFilter === "all" ? "все расы" : metaLabel(order.raceFilter, "ru")}` : `Race filter: ${order.raceFilter === "all" ? "all races" : metaLabel(order.raceFilter, "en")}`} title={ru ? "Фильтр по расе" : "Filter by race"}><ListFilter size={19} aria-hidden="true" /><SelectValue className="sr-only" /></SelectTrigger>
          <SelectContent className="tavern-race-menu">
            <SelectItem className="tavern-race-option" value="all">{ru ? "Все расы" : "All races"}</SelectItem>
            {RACES.map(race => <SelectItem className="tavern-race-option" key={race} value={race}>{metaLabel(race, ru ? "ru" : "en")}</SelectItem>)}
          </SelectContent>
        </Select>}
        {order.otherHeroes.length > 0 && <button type="button" data-hero-grid-toggle onClick={toggleGrid} aria-label={nextGridLabel} title={nextGridLabel}>{gridColumns === 1 ? <Rows2 size={20} aria-hidden="true" /> : gridColumns === 2 ? <Columns2 size={20} aria-hidden="true" /> : <Columns3 size={20} aria-hidden="true" />}</button>}
        {order.otherHeroes.length > 1 && !order.editing && <button type="button" data-hero-order-edit onClick={order.start} aria-label={ru ? "Изменить порядок героев" : "Edit hero order"} title={ru ? "Изменить порядок" : "Edit order"}><Pencil size={17} aria-hidden="true" /></button>}
      </div>
    </div>
    {order.editing ? <>
      <p className="sr-only">{ru ? "Перетащи героя на нужное место. С клавиатуры используй стрелки." : "Drag a hero into place. Use arrow keys with a keyboard."}</p>
      <div data-other-heroes-grid data-grid-columns={gridColumns} data-hero-order-grid>
        {order.editHeroes.map((hero, index) => {
          const key = heroKey(hero);
          return <div key={key} data-hero-order-tile={key} data-dragging={dragging === key || undefined} data-drop-target={dropTarget === key && dragging !== key || undefined}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              let parent = event.currentTarget.parentElement;
              while (parent && !["auto", "scroll"].includes(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
              scrollHost.current = parent;
              drag.current = { key, element: event.currentTarget, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, lastY: event.clientY, scrollTop: parent?.scrollTop ?? 0, mode: event.pointerType === "touch" ? "pending" : "drag" };
              if (event.pointerType === "touch") holdTimer.current = window.setTimeout(activateDrag, 140);
              else { movePreview(); setDragging(key); }
            }}
            onPointerMove={event => {
              const current = drag.current;
              if (current?.key !== key) return;
              const deltaY = event.clientY - current.lastY;
              current.x = event.clientX; current.y = event.clientY; current.lastY = event.clientY;
              if (current.mode === "pending") {
                const dx = event.clientX - current.startX;
                const dy = event.clientY - current.startY;
                if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { current.mode = "scroll"; clearHold(); }
                else if (Math.abs(dx) > 8) activateDrag();
              }
              if (current.mode === "scroll") { if (scrollHost.current) scrollHost.current.scrollTop -= deltaY; return; }
              if (current.mode === "drag") { movePreview(); setDropTarget(tileAt(event.clientX, event.clientY)); }
            }}
            onPointerUp={event => { if (drag.current?.key === key && drag.current.mode === "drag") { const target = tileAt(event.clientX, event.clientY); if (target) order.moveToHero(key, target); } stopDrag(); }}
            onPointerCancel={stopDrag}
            onKeyDown={event => {
              const columnStep = gridColumns;
              const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columnStep : event.key === "ArrowDown" ? columnStep : 0;
              if (step) { event.preventDefault(); order.move(key, Math.max(0, Math.min(order.editHeroes.length - 1, index + step))); }
            }}>
            <TavernHeroCard hero={hero} active={false} compact lang={ru ? "ru" : "en"} onOpen={() => {}} />
          </div>;
        })}
      </div>
      {order.saveError && <p role="alert" data-hero-order-error>{ru ? "Не удалось сохранить порядок в этом браузере. Попробуй ещё раз." : "Could not save the order in this browser. Try again."}</p>}
      <div data-hero-order-actions>
        <button type="button" onClick={order.cancel} aria-label={ru ? "Отмена" : "Cancel"}><span data-hero-order-action-icon><X size={22} aria-hidden="true" /></span><span data-hero-order-action-label aria-hidden="true">{ru ? "Отмена" : "Cancel"}</span></button>
        <button type="button" onClick={order.save} aria-label={ru ? "Сохранить" : "Save"}><span data-hero-order-action-icon><Check size={22} aria-hidden="true" /></span><span data-hero-order-action-label aria-hidden="true">{ru ? "Сохранить" : "Save"}</span></button>
      </div>
    </> : <div data-other-heroes-grid data-grid-columns={gridColumns}>
      {order.visibleHeroes.map(hero => {
        const pinned = order.pinnedKeys.has(heroKey(hero));
        return <div key={heroKey(hero)} data-hero-pin-card>
          <TavernHeroCard hero={hero} active={false} compact lang={ru ? "ru" : "en"} onOpen={() => onOpen(hero)} onShowBusyField={onShowBusyField} />
          <button type="button" data-hero-pin data-pinned={pinned || undefined} aria-pressed={pinned} aria-label={`${pinned ? (ru ? "Открепить" : "Unpin") : (ru ? "Закрепить" : "Pin")} ${hero.name}`} title={pinned ? (ru ? "Открепить" : "Unpin") : (ru ? "Закрепить" : "Pin")} onClick={() => order.togglePin(hero)}><Bookmark aria-hidden="true" size={19} fill={pinned ? "currentColor" : "none"} /></button>
        </div>;
      })}
    </div>}
    {order.otherHeroes.length === 0 && <p>{ru ? "Других героев пока нет" : "No other heroes yet"}</p>}
    {!order.editing && order.otherHeroes.length > 0 && order.visibleHeroes.length === 0 && <p data-hero-race-empty role="status">{ru ? "Героев этой расы пока нет." : "No heroes of this race yet."} <button type="button" onClick={() => order.setRaceFilter("all")}>{ru ? "Показать всех" : "Show all"}</button></p>}
    {order.pinSaveError && <p role="alert" data-hero-order-error>{ru ? "Не удалось сохранить закрепление. Попробуй ещё раз." : "Could not save pinned heroes. Try again."}</p>}
  </section>;
}
