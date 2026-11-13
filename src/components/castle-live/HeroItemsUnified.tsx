import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import type { BackpackStack, BackpackView } from "@/server/api/beta-raid/market-backpack";
import { bagLayout, type Cell } from "@/components/beta-raid/backpackCellList";
import { boostListText, boostEffectText } from "@/lib/hero/boost";
import { qtyText } from "@/lib/qtyPick";
import { applyItemBoost } from "@/server/api/beta-raid/boost-item";
import { newOpId } from "@/lib/opId";
import { invalidateBackpack, invalidateHeroQueries } from "@/lib/query";
import { humanError } from "@/lib/humanError";
import { useLang } from "@/lib/i18n";
import { plantOfStack } from "@/lib/treePlant";
import { isDynamiteKey } from "@/lib/dynamite";
import { isDaraiMineKey } from "@/lib/daraiMine";
import { DaraiMineTimer } from "@/components/beta-raid/dmine/DaraiMineTimer";
import "./hero-items-unified.css";

import { thumb } from "@/lib/image";
type PocketData = BackpackView & { potionCapacity?: number; potionOccupied?: number; alchemy?: number };
type Selection = Record<string, number>;
export type HeroItemActions = {
  canDiscard: (item: BackpackStack) => boolean;
  canUseTool: (item: BackpackStack) => boolean;
  canPlace: (item: BackpackStack) => boolean;
  discard: (item: BackpackStack) => void;
  useTool: (item: BackpackStack) => void;
  place: (item: BackpackStack) => void;
};
const previewCount = 8;
const maxUseQuantity = 1000;
const plural = (n: number, forms: [string, string, string]) => forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];

function useItemColumns() {
  const columns = () => typeof window === "undefined" ? 0 : window.innerWidth >= 900 ? 5 : window.innerWidth >= 768 ? 4 : 0;
  const [value, setValue] = useState(columns);
  useEffect(() => {
    const update = () => setValue(columns());
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);
  return value;
}

function QuantityInput({ value, max, label, disabled, onChange }: {
  value: number; max: number; label: string; disabled: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={label}
    value={draft} disabled={disabled}
    onFocus={event => event.currentTarget.select()}
    onChange={event => {
      const text = event.currentTarget.value;
      if (!/^\d*$/.test(text)) return;
      if (!text || Number(text) === 0) { setDraft(text); return; }
      const next = Math.min(max, Number(text));
      setDraft(String(next));
      onChange(next);
    }}
    onBlur={() => setDraft(String(value))}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
    }} />;
}

export function HeroItemsUnified({ data, loading = false, allowUse, beforeUse, previewUse, actions }: {
  data?: BackpackView;
  loading?: boolean;
  allowUse: boolean;
  beforeUse?: () => Promise<void>;
  previewUse?: (rows: { key: string; qty: number }[]) => Promise<number>;
  actions?: HeroItemActions;
}) {
  const ru = useLang() !== "en";
  if (loading) return <p role="status" className="hero-items-empty">{ru ? "Загрузка…" : "Loading…"}</p>;
  if (!data?.heroId) return <p className="hero-items-empty">{ru ? "Герой не выбран" : "No hero selected"}</p>;
  const extra = data as PocketData;
  const supported = Number.isFinite(extra.potionCapacity) && data.stacks.every(s => typeof (s as typeof s & { potion?: unknown }).potion === "boolean");
  if (!supported) return <p role="status" className="hero-items-empty">{ru ? "Данные карманов пока недоступны." : "Pocket data is unavailable."}</p>;
  return <HeroItemsContent data={extra} allowUse={allowUse} beforeUse={beforeUse} previewUse={previewUse} actions={actions} />;
}

function HeroItemsContent({ data, allowUse, beforeUse, previewUse, actions }: {
  data: PocketData;
  allowUse: boolean;
  beforeUse?: () => Promise<void>;
  previewUse?: (rows: { key: string; qty: number }[]) => Promise<number>;
  actions?: HeroItemActions;
}) {
  const ru = useLang() !== "en";
  const qc = useQueryClient();
  const desktopColumns = useItemColumns();
  const [expanded, setExpanded] = useState({ potions: false, backpack: false });
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>({});
  const [sheet, setSheet] = useState<"item" | "confirm" | null>(null);
  const [itemKey, setItemKey] = useState<string | null>(null);
  useEffect(() => { setExpanded({ potions: false, backpack: false }); setSelectionOpen(false); setSelection({}); setSheet(null); }, [data?.heroId]);
  const sheetReturnFocus = useRef<HTMLElement | null>(null);
  const openSheet = (kind: "item" | "confirm", key?: string) => {
    sheetReturnFocus.current = document.activeElement as HTMLElement | null;
    if (key) setItemKey(key);
    setSheet(kind);
  };
  const extra = data;
  const layout = bagLayout(data.stacks, data.capacity, extra.potionCapacity ?? 0, data.mainTool ?? null);
  const stackFor = (key: string) => data.stacks.find(s => s.stackKey === key);
  const chosen = Object.entries(selection).flatMap(([key, qty]) => {
    const stack = stackFor(key);
    return stack?.boost?.length && stack.count >= 1 && qty > 0 ? [{ stack, qty: Math.min(qty, Math.floor(stack.count), maxUseQuantity) }] : [];
  });
  const total = chosen.reduce((sum, row) => sum + row.qty, 0);
  const potionCount = chosen.filter(({ stack }) => (stack as BackpackStack & { potion?: boolean }).potion).length;
  const selectionKind = !chosen.length || (potionCount > 0 && potionCount < chosen.length) ? "mixed" : potionCount ? "potions" : "food";
  const actionText = selectionKind === "food" ? (ru ? "Съесть" : "Eat") : selectionKind === "potions" ? (ru ? "Выпить" : "Drink") : (ru ? "Использовать" : "Use");
  const pendingText = selectionKind === "food" ? (ru ? "Едим…" : "Eating…") : selectionKind === "potions" ? (ru ? "Пьём…" : "Drinking…") : (ru ? "Используем…" : "Using…");
  const confirmText = selectionKind === "food" ? (ru ? "Съесть выбранную еду?" : "Eat selected food?") : selectionKind === "potions" ? (ru ? "Выпить выбранные зелья?" : "Drink selected potions?") : (ru ? "Использовать предметы?" : "Use selected items?");
  const item = itemKey ? stackFor(itemKey) : undefined;
  const change = (key: string, delta: number) => setSelection(current => {
    const count = Math.min(maxUseQuantity, Math.floor(stackFor(key)?.count ?? 0));
    const next = Math.min(count, Math.max(0, (current[key] ?? 0) + delta));
    const result = { ...current };
    if (next) result[key] = next; else delete result[key];
    return result;
  });
  const toggleItem = (key: string) => {
    setSelection(current => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else if ((stackFor(key)?.count ?? 0) > 0) next[key] = 1;
      return next;
    });
    setSelectionOpen(true);
  };
  const useItems = useMutation({
    mutationFn: async (rows: { key: string; qty: number }[]) => {
      if (previewUse) return { used: await previewUse(rows), effects: [] as string[] };
      if (!allowUse || !beforeUse) throw new Error(ru ? "Использовать вещи можно только у активного героя." : "Only the active hero can use items.");
      await beforeUse();
      let used = 0;
      const effects: string[] = [];
      try {
        for (const row of rows) {
          const result = await applyItemBoost({ data: { stackKey: row.key, qty: row.qty, op: newOpId() } });
          effects.push(...result.rolls.map(roll => boostEffectText({ stat: roll.stat, value: String(roll.amount), minutes: String(roll.minutes), ability: roll.ability }, ru ? "ru" : "en")));
          used += row.qty;
        }
      } catch (error) {
        invalidateBackpack(qc);
        invalidateHeroQueries(qc, ["beta-raid-state"]);
        if (used) throw new Error(ru ? `Использовано ${used} из ${rows.reduce((n, r) => n + r.qty, 0)}. Проверь остатки перед новым выбором.` : `Used ${used} items. Check your remaining items before selecting again.`);
        throw error;
      }
      return { used, effects };
    },
    onSuccess: ({ effects }, rows) => {
      toast.success(`${ru ? "Активировано" : "Activated"}: ${rows.map(r => `${stackFor(r.key)?.name ?? ""} ×${r.qty}`).join(", ")}${effects.length ? ` · ${effects.join(" · ")}` : ""}`);
      setSelection({}); setSelectionOpen(false); setSheet(null);
      invalidateBackpack(qc);
      invalidateHeroQueries(qc, ["beta-raid-state"]);
    },
    onError: (error: Error) => { setSelection({}); setSheet(null); toast.error(humanError(error)); },
  });
  const renderCells = (cells: (Cell | null)[], kind: "potions" | "backpack") => {
    // Backpack capacity is the number of usable cells, so show every cell on wider screens.
    const visible = kind === "backpack" && desktopColumns ? cells : desktopColumns ? (() => {
      const occupied = cells.filter((cell): cell is Cell => cell !== null);
      const columns = desktopColumns;
      const emptyCount = Math.min(cells.length - occupied.length, occupied.length ? (columns - occupied.length % columns) % columns : columns);
      return [...occupied, ...Array<Cell | null>(emptyCount).fill(null)];
    })() : expanded[kind] ? cells : cells.slice(0, previewCount);
    return <>
      <div className={`hero-items-grid ${kind === "backpack" ? "is-backpack" : ""}`}>
        {visible.map((cell, index) => {
          if (!cell) return <div key={`empty-${kind}-${index}`} className="hero-items-cell is-empty" aria-label={ru ? "Пустая ячейка" : "Empty slot"} />;
          const shownQty = qtyText(cell.units, ru ? "ru" : "en", 2);
          const contents = <>{cell.image && <img src={thumb(cell.image, 128)} alt="" loading="lazy" />}<span className="hero-items-cell-name">{cell.name}</span>{cell.main && <span className="hero-items-main-tool">{ru ? "В руках" : "Equipped"}</span>}{cell.durability != null && <span className="hero-items-durability">{Math.min(100, Math.max(1, Math.round(Number(cell.durability) || 0)))}%</span>}{isDaraiMineKey(cell.stackKey) && <DaraiMineTimer stackKey={cell.stackKey} heroId={data.heroId} className="hero-items-timer" />}<b>×{shownQty}</b></>;
          if (cell.boost?.length && (stackFor(cell.stackKey)?.count ?? 0) >= 1) return <div key={cell.key} className="hero-items-cell" data-selected={!!selection[cell.stackKey] || undefined} data-stack-key={cell.stackKey}>
            <button type="button" className="hero-items-cell-main" aria-label={`${cell.name}, ${shownQty} ${ru ? "шт. Показать свойства" : "items. Show effects"}`} onClick={() => openSheet("item", cell.stackKey)}>{contents}</button>
            <button type="button" className="hero-items-check" disabled={useItems.isPending} aria-label={ru ? `${selection[cell.stackKey] ? "Убрать из выбора" : "Выбрать"} ${cell.name}` : `${selection[cell.stackKey] ? "Deselect" : "Select"} ${cell.name}`} aria-pressed={!!selection[cell.stackKey]} onClick={() => toggleItem(cell.stackKey)}>{selection[cell.stackKey] ? "✓" : ""}</button>
          </div>;
          return <button key={cell.key} type="button" className="hero-items-cell" data-stack-key={cell.stackKey} aria-label={`${cell.name}, ${shownQty} ${ru ? "шт." : "items"}`} onClick={() => openSheet("item", cell.stackKey)}>{contents}</button>;
        })}
      </div>
      {!desktopColumns && cells.length > previewCount && <button className="hero-items-more" type="button" onClick={() => setExpanded(current => ({ ...current, [kind]: !current[kind] }))}>
        {expanded[kind] ? (ru ? "Свернуть" : "Show less") : kind === "potions" ? (ru ? "Показать все карманы" : "Show all pockets") : (ru ? "Показать все предметы" : "Show all items")}
        <ChevronDown size={18} className={expanded[kind] ? "is-up" : ""} aria-hidden="true" />
      </button>}
    </>;
  };
  return <div className="hero-items-unified">
    <h2>{ru ? "Вещи героя" : "Hero items"}</h2>
    <section className="hero-items-section" aria-label={ru ? "Алхимические карманы" : "Alchemy pockets"}>
      <header><h3>{ru ? "Алхимические карманы" : "Alchemy pockets"}</h3><span>{extra.potionOccupied ?? layout.potions.filter(Boolean).length}/{extra.potionCapacity}</span></header>
      {renderCells(layout.potions, "potions")}
    </section>
    <section className="hero-items-section hero-items-selection" aria-label={ru ? "Использование предметов" : "Use items"}>
      <div className="hero-items-selection-bar">
        <button type="button" onClick={() => setSelectionOpen(current => !current)} aria-expanded={selectionOpen} aria-controls="hero-items-selected-items" aria-label={ru ? "Раскрыть выбранные предметы и эффекты" : "Expand selected items and effects"}>
          {ru ? `Выбрано: ${total} ${plural(total, ["предмет", "предмета", "предметов"])} · ${chosen.length} ${plural(chosen.length, ["вид", "вида", "видов"])}` : `Selected: ${total} ${total === 1 ? "item" : "items"} · ${chosen.length} ${chosen.length === 1 ? "type" : "types"}`}<ChevronDown size={17} className={selectionOpen ? "is-up" : ""} aria-hidden="true" />
        </button>
        <button data-game-button="primary" type="button" disabled={!total || !allowUse || useItems.isPending} onClick={() => openSheet("confirm")}>{actionText} {total}</button>
      </div>
      {selectionOpen && <div id="hero-items-selected-items" className="hero-items-selection-details" role="region" aria-label={ru ? "Выбранные предметы и эффекты" : "Selected items and effects"}>
        {chosen.length ? chosen.map(({ stack, qty }) => <div className="hero-items-selected-row" key={stack.stackKey}>
          <div className="hero-items-selected-icon">{stack.image && <img src={thumb(stack.image, 128)} alt="" />}</div><div><strong>{stack.name}</strong><small>{boostListText(stack.boost ?? [], ru ? "ru" : "en").replace(ru ? " на 0 мин" : " for 0 min", "")}</small></div>
          <div className="hero-items-stepper"><button type="button" disabled={useItems.isPending} onClick={() => change(stack.stackKey, -1)} aria-label={ru ? `Уменьшить количество: ${stack.name}` : `Decrease quantity: ${stack.name}`}>−</button><QuantityInput value={qty} max={Math.min(maxUseQuantity, Math.floor(stack.count))} disabled={useItems.isPending} label={ru ? `Количество: ${stack.name}` : `Quantity: ${stack.name}`} onChange={value => setSelection(current => ({ ...current, [stack.stackKey]: value }))} /><button type="button" onClick={() => change(stack.stackKey, 1)} disabled={useItems.isPending || qty >= Math.min(maxUseQuantity, Math.floor(stack.count))} aria-label={ru ? `Увеличить количество: ${stack.name}` : `Increase quantity: ${stack.name}`}>+</button><button type="button" className="hero-items-all" disabled={useItems.isPending || qty >= Math.min(maxUseQuantity, Math.floor(stack.count))} onClick={() => setSelection(current => ({ ...current, [stack.stackKey]: Math.min(maxUseQuantity, Math.floor(stack.count)) }))}>{ru ? "Все" : "All"}</button></div>
          <small className="hero-items-quantity-stock">{ru ? `В наличии: ${Math.floor(stack.count)} · Останется: ${Math.floor(stack.count) - qty}` : `Available: ${Math.floor(stack.count)} · Remaining: ${Math.floor(stack.count) - qty}`}</small>
        </div>) : <p className="hero-items-selection-empty">{ru ? "Предметы пока не выбраны" : "No items selected"}</p>}
      </div>}
    </section>
    <section className="hero-items-section" aria-label={ru ? "Рюкзак" : "Backpack"}>
      <header data-backpack-header><h3>{ru ? "Рюкзак" : "Backpack"}</h3><span>{data.occupied}/{data.capacity}</span></header>
      {renderCells(layout.backpack, "backpack")}
    </section>
    <Dialog.Root open={!!sheet} onOpenChange={open => { if (!open && !useItems.isPending) setSheet(null); }}>
      <Dialog.Portal><Dialog.Overlay className="hero-items-overlay" />
        <Dialog.Content className="hero-items-sheet" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); sheetReturnFocus.current?.focus(); }} onEscapeKeyDown={event => { if (useItems.isPending) event.preventDefault(); }} onPointerDownOutside={event => { if (useItems.isPending) event.preventDefault(); }}>
          <Dialog.Close className="hero-items-close" disabled={useItems.isPending} aria-label={ru ? "Закрыть" : "Close"}><X size={20} /></Dialog.Close>
          {sheet === "confirm" ? <>
            <Dialog.Title>{confirmText}</Dialog.Title>
            {chosen.map(({ stack, qty }) => <div key={stack.stackKey} className="hero-items-confirm-row"><strong>{stack.name} ×{qty}</strong><small>{ru ? `Останется: ${Math.floor(stack.count) - qty}` : `Remaining: ${Math.floor(stack.count) - qty}`}</small></div>)}
            <div className="hero-items-item-actions"><button type="button" disabled={useItems.isPending} onClick={() => setSheet(null)}>{ru ? "Назад" : "Back"}</button><button data-game-button="primary" type="button" disabled={!total || (!allowUse && !previewUse) || useItems.isPending} onClick={() => useItems.mutate(chosen.map(({ stack, qty }) => ({ key: stack.stackKey, qty })))}>{useItems.isPending ? pendingText : `${actionText} ${total}`}</button></div>
          </> : item && <>
            <div className="hero-items-item-head" data-stack-key={item.stackKey}>{item.image && <img src={thumb(item.image, 128)} alt="" />}<div><Dialog.Title>{item.name}</Dialog.Title><p>{ru ? `В наличии: ${Math.floor(item.count)}` : `Available: ${Math.floor(item.count)}`}</p></div></div>
            {item.boost?.length ? <p className="hero-items-effect">{boostListText(item.boost, ru ? "ru" : "en").replace(ru ? " на 0 мин" : " for 0 min", "")}</p> : <p className="hero-items-effect">{ru ? "Предмет в рюкзаке" : "Item in backpack"}</p>}
            <div className="hero-items-item-actions"><Dialog.Close>{ru ? "Закрыть" : "Close"}</Dialog.Close>{!!item.boost?.length && item.count >= 1 && <button data-game-button="primary" type="button" disabled={useItems.isPending} onClick={() => { change(item.stackKey, 1); setSelectionOpen(true); setSheet(null); }}>{ru ? "Выбрать 1" : "Select 1"}</button>}{actions?.canUseTool(item) && <button type="button" onClick={() => { setSheet(null); actions.useTool(item); }}>{item.binocular || item.ladder ? (ru ? "Применить" : "Use") : ru ? "Инструмент" : "Tool"}</button>}{actions?.canPlace(item) && <button type="button" onClick={() => { setSheet(null); actions.place(item); }}>{plantOfStack(item.stackKey)?.kind === "tree" ? (ru ? "Использовать" : "Use") : isDynamiteKey(item.stackKey) ? (ru ? "Бросить" : "Throw") : ru ? "Поставить" : "Place"}</button>}{actions?.canDiscard(item) && <button className="hero-items-discard" type="button" onClick={() => { setSheet(null); actions.discard(item); }}>{ru ? "Выбросить…" : "Discard…"}</button>}</div>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}


