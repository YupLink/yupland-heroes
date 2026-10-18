import { useState, useRef, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { metaLabel } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import type { GearSlotView } from "@/server/api/heroes-gear";

import type { GearContainers } from "./useGearContainerPreview";

const placement: Record<string, { side: "left" | "right"; row: number; sprite: string }> = {
  "Голова": { side: "left", row: 1, sprite: "bg-position-[0%_0%]" },
  "Шея": { side: "left", row: 2, sprite: "bg-position-[33.333%_0%]" },
  "Правая рука": { side: "left", row: 3, sprite: "bg-position-[66.667%_0%]" },
  "Карманы": { side: "left", row: 4, sprite: "bg-position-[100%_0%]" },
  "Тело": { side: "right", row: 1, sprite: "bg-position-[0%_100%]" },
  "Левая рука": { side: "right", row: 2, sprite: "bg-position-[33.333%_100%]" },
  "Руки": { side: "right", row: 3, sprite: "bg-position-[66.667%_100%]" },
  "Ноги": { side: "right", row: 4, sprite: "bg-position-[100%_100%]" },
};
const approvedPlacement: Record<string, { side: "left" | "right"; row: number; sprite: string }> = {
  "Голова": placement["Голова"],
  "Тело": { ...placement["Тело"], side: "left", row: 2 },
  "Левая рука": { ...placement["Левая рука"], side: "left", row: 3 },
  "Руки": { ...placement["Руки"], side: "left", row: 4 },
  "Шея": { ...placement["Шея"], side: "right", row: 1 },
  "Правая рука": { ...placement["Правая рука"], side: "right", row: 2 },
  "Карманы": { ...placement["Карманы"], side: "right", row: 3 },
  "Ноги": placement["Ноги"],
};
const rowClass = ["", "row-start-1", "row-start-2", "row-start-3", "row-start-4"];

export function GearSlotIcon({ slot }: { slot: string }) {
  return <span aria-hidden="true" className={`block h-full w-full rounded bg-[url('/design-assets/gear-icons.webp')] bg-size-[400%_200%] ${placement[slot]?.sprite ?? "bg-position-[0%_0%]"}`} />;
}

export function GearPaperDoll({ slots, selectedKey, onSelect, slotDetails, race, onNavigate, containers, referenceLayout = false }: {
  slots: GearSlotView[];
  containers?: GearContainers;
  slotDetails: ReactNode;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  race?: string | null;
  onNavigate?: (tab: "backpack" | "potions" | "spells") => void;
  referenceLayout?: boolean;
}) {
  const lang = useLang();
  const [lockedSlot, setLockedSlot] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const groups = Object.entries(referenceLayout ? approvedPlacement : placement).map(([type, place]) => ({
    type, place, members: slots.filter((slot) => slot.slot === type),
  }));
  const selected = groups.find(group => group.members.some(slot => slot.key === selectedKey));
  const current = selected ?? groups.find(group => group.type === openGroup);
  const close = () => {
    const trigger = lockedSlot ?? current?.type;
    if (trigger) triggers.current[trigger]?.focus();
    onSelect(null); setOpenGroup(null); setLockedSlot(null);
  };
  useEffect(() => { if (current || lockedSlot) panelRef.current?.focus(); }, [current?.type, selectedKey, lockedSlot]);
  const raceKey = ({ "Юпик": "yupik", "Юбик": "yupik", "Дракон": "dragon", "Пчела": "bee", "Кабан": "boar", "Вихотка": "dragoncat", "ДраКошка": "dragoncat", "Единорог": "unicorn" } as Record<string, string>)[race ?? ""] ?? "yupik";
  const renderSlot = ({type, members}: (typeof groups)[number]) => {
          const locked = members.length === 0;
          const active = members.some(slot => slot.key === selectedKey) || openGroup === type;
          const occupied = members.filter(slot => slot.item).length;
          const preview = members.find(slot => slot.item?.imageUrl)?.item;
          const label = metaLabel(type, lang);
          return <div key={type}>
            <button data-gear-slot style={{ isolation: "isolate" }} data-game-button="surface" ref={node => { triggers.current[type] = node; }} type="button" aria-label={locked ? `${label}: ${lang === "ru" ? "нужна более высокая редкость" : "higher rarity required"}` : `${label}, ${occupied}/${members.length}`} aria-expanded={active || lockedSlot === type} onClick={() => {
              if (locked) { close(); setLockedSlot(type); return; }
              setLockedSlot(null);
              if (active) { close(); return; }
              setOpenGroup(members.length > 1 ? type : null);
              onSelect(members.length === 1 ? members[0].key : null);
            }} className={`relative flex h-[var(--gear-cell)] w-[var(--gear-cell)] flex-col items-center justify-center bg-[url('/design-assets/gear-slot-frame.webp')] bg-cover bg-center px-1.5 py-1 text-center text-[#f1e9d8] focus-visible:outline-2 focus-visible:outline-gold ${locked ? "saturate-50 opacity-80" : ""} ${active ? "outline outline-2 outline-gold brightness-125" : "hover:brightness-125"}`}>
              <img data-gear-slot-frame src="/design-assets/gear-slot-frame.webp" alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" }} />
              {locked ? <img src="/design-assets/gear-lock.webp" alt="" className="h-6 w-6 shrink-0 object-contain" /> : preview?.imageUrl ? <img src={thumb(preview.imageUrl, 96, "black")} alt="" data-gear-item className="h-7 w-7 object-contain" /> : <span className="h-6 w-6 shrink-0"><GearSlotIcon slot={type} /></span>}
              <span className="mt-0.5 flex h-5 w-full items-center justify-center break-words text-[10px] font-normal leading-[10px]">{label}</span>
              {members.length > 1 && <><span className="absolute -right-1 -top-1 rounded-full bg-gold px-1.5 text-[10px] font-bold text-background">×{members.length}</span><span className="text-[10px] leading-none text-[#d5c7ad]">{occupied}/{members.length}</span></>}
              {!referenceLayout && members.length === 1 && occupied > 0 && <span className="absolute right-1 top-0 text-[9px] text-gold">✓</span>}
            </button>
          </div>;

  };
  const navigationIcon = (tab: "backpack" | "spells") => {
    const label = tab === "backpack" ? (lang === "ru" ? "Рюкзак и алхимические карманы" : "Backpack and alchemy pockets") : (lang === "ru" ? "Книга заклинаний" : "Spellbook");
    const content = tab === "backpack" && containers ? {
      count: containers.backpack.count + containers.potions.count,
      loaded: containers.backpack.loaded && containers.potions.loaded,
      error: containers.backpack.error || containers.potions.error,
    } : containers?.[tab];
    const state = content?.error ? "error" : !content?.loaded ? "loading" : content.count > 0 ? "occupied" : "empty";
    return <button data-game-button="surface" key={tab} data-gear-nav={tab} data-container-state={state} type="button" onClick={() => { close(); onNavigate?.(tab); }} aria-label={`${label}${content?.error ? (lang === "ru" ? ": не удалось загрузить" : ": could not load") : content?.loaded ? content.count ? `: ${content.count}` : lang === "ru" ? ": пусто" : ": empty" : ""}`} title={tab === "backpack" ? label : containers?.spells.name ?? label} className="relative grid h-[var(--gear-cell)] w-[var(--gear-cell)] shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-gold hover:brightness-125">
      <span data-tab-icon={tab} className="h-[90%] w-[90%]" aria-hidden="true" />
      {content?.error && <span className="absolute bottom-0 right-0 rounded-full bg-[#171b20] px-1.5 text-gold">!</span>}
      {content?.loaded && content.count > 0 && <span data-container-count className="absolute bottom-0 right-0 rounded-full bg-[#171b20] px-1.5 text-[11px] leading-5 text-gold">{content.count}</span>}
    </button>;
  };
  return (
    <div data-gear-field className="relative mx-auto h-[388px] w-full max-w-sm overflow-hidden rounded-2xl border border-[#68645d] bg-[#17191c]">
      <img data-gear-backdrop src={raceKey === "yupik" ? "/design-assets/gear-scene-png-optimized.webp" : `/design-assets/gear-race-${raceKey}.png`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <img data-gear-figure src={raceKey === "yupik" ? "/design-assets/gear-scene-png-optimized.webp" : `/design-assets/gear-race-${raceKey}.png`} alt="" className="absolute inset-0 h-full w-full object-contain object-center" />
      <div className="relative grid h-full grid-cols-[var(--gear-cell)_minmax(0,1fr)_var(--gear-cell)] grid-rows-4 items-center gap-x-1 px-2 py-3">
        {groups.map(group => <div key={group.type} className={`${group.place.side === "left" ? "col-start-1" : "col-start-3"} ${rowClass[group.place.row]}`}>{renderSlot(group)}</div>)}
      </div>
      <div data-gear-nav-row className="absolute left-1/2 bottom-[calc(12px+(364px/8)-var(--gear-cell)/2)] -translate-x-1/2 flex items-center justify-center gap-1">
        {onNavigate && (["backpack", "spells"] as const).map(navigationIcon)}
      </div>
      {lockedSlot && <div ref={panelRef} tabIndex={-1} role="dialog" aria-label={lang === "ru" ? "Недоступный слот" : "Unavailable slot"} onKeyDown={e => { if(e.key === "Escape") { e.stopPropagation(); close(); } }} className="absolute inset-x-3 top-24 z-30 border border-[#68645d] bg-[#0c1014]/95 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2"><h4>{metaLabel(lockedSlot, lang)}</h4><button data-close-button data-game-button="icon" type="button" aria-label={lang === "ru" ? "Закрыть пояснение" : "Close explanation"} onClick={close} className="grid h-11 w-11 place-items-center"><X className="h-4 w-4" /></button></div>
        <p className="text-sm">{lang === "ru" ? "Этот слот доступен героям более высокой редкости." : "This slot is available to heroes of higher rarity."}</p>
      </div>}
      {current && <div ref={panelRef} tabIndex={-1} role="dialog" aria-label={metaLabel(current.type, lang)} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }} style={selected ? undefined : { width: `calc(${current.members.length} * var(--gear-cell) + ${(current.members.length - 1) * 2 + 18}px)`, maxWidth: "calc(100% - 16px)" }} className={`absolute ${selected ? "inset-x-2" : "left-1/2 -translate-x-1/2"} top-14 max-h-[calc(100%-64px)] z-20 overflow-y-auto overscroll-contain border border-[#68645d] bg-[#0c1014]/95 p-2 shadow-xl focus:outline-none`}>
        <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-1 bg-[#0c1014]">
          {selected && current.members.length > 1 ? <button data-game-button="secondary" type="button" className="min-h-11 px-2 text-xs text-gold" onClick={() => { onSelect(null); setOpenGroup(current.type); }}>← {metaLabel(current.type, lang)}</button> : <h4 className="px-2 text-sm">{metaLabel(current.type, lang)}</h4>}
          <button data-close-button data-game-button="icon" type="button" aria-label={lang === "ru" ? "Закрыть выбор артефакта" : "Close artifact picker"} className="grid h-11 w-11 shrink-0 place-items-center" onClick={close}><X className="h-4 w-4" /></button>
        </div>
        {selected ? slotDetails : <div data-gear-group-options className={`flex ${referenceLayout ? "flex-wrap justify-center" : "flex-nowrap"} gap-0.5`}>{current.members.map(slot => <button data-gear-slot style={{ isolation: "isolate" }} data-game-button="surface" key={slot.key} type="button" aria-label={`${metaLabel(slot.slot, lang)} ${slot.index}, ${slot.item?.name ?? (lang === "ru" ? "Пусто" : "Empty")}`} onClick={() => { onSelect(slot.key); setOpenGroup(null); }} className="relative flex h-[var(--gear-cell)] w-[var(--gear-cell)] shrink-0 flex-col items-center justify-center bg-[url('/design-assets/gear-slot-frame.webp')] bg-cover p-1 text-[10px] focus-visible:outline-2 focus-visible:outline-gold hover:brightness-125">
          <img data-gear-slot-frame src="/design-assets/gear-slot-frame.webp" alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" }} />
          <span className="absolute right-2 top-1 text-gold">{slot.index}</span>
          <span className="h-6 w-6">{slot.item?.imageUrl ? <img src={thumb(slot.item.imageUrl, 64, "black")} alt="" className="h-full w-full object-cover" /> : <GearSlotIcon slot={slot.slot} />}</span>
          <span className="mt-1 w-full truncate text-center">{slot.item?.name ?? (lang === "ru" ? "Пусто" : "Empty")}</span>
        </button>)}</div>}
      </div>}
    </div>
  );
}
