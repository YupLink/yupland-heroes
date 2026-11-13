// Константы, пилюли и пикер приза формы аукциона — вынесены, чтобы форма
// осталась ≤250 строк.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ArtWearBar } from "@/components/ArtWearBar";
import { EnchantMark } from "@/components/EnchantMark";

export type PrizeKind = "pack" | "hero" | "artifact" | "resource";

export const KIND_LABELS: Array<{ id: PrizeKind; label: string }> = [
  { id: "pack", label: "Пак / бокс" },
  { id: "hero", label: "Герой" },
  { id: "artifact", label: "Артефакт" },
  { id: "resource", label: "Ресурс" },
];
export const DURATIONS = ["1h", "6h", "12h", "1d", "3d", "7d"] as const;
export const DUR_LABEL: Record<string, string> = {
  "1h": "1 час",
  "6h": "6 ч",
  "12h": "12 ч",
  "1d": "1 день",
  "3d": "3 дня",
  "7d": "7 дней",
};
export const STEPS = [1, 3, 5, 10];
export const SNIPE = [0, 5, 10, 15];
export const RESOURCES = [
  { ref: "gold", label: "Золото", image: "/resources/gold.webp" },
  { ref: "stone", label: "Камень", image: "/resources/stone.webp" },
  { ref: "wood", label: "Дерево", image: "/resources/wood.webp" },
  { ref: "diamonds", label: "Алмазы", image: "/resources/crystal.webp" },
];

export type PrizeOption = {
  ref: string;
  label: string;
  image?: string | null;
  /** Задана — это артефакт: полоса прочности под картинкой (artWear). */
  durability?: number | null;
  /** Зачарованные в группе артефактов (§8.87): ✦ с «N из M». */
  enchant?: { pct: number; n: number; total: number };
};

/** ✦ на картинке варианта: группа — шаблон и износ, поэтому «N из M». */
const PrizeEnchant = ({ o }: { o?: PrizeOption }) =>
  o?.enchant ? <EnchantMark pct={o.enchant.pct} corner of={o.enchant} /> : null;

/** Целое из поля в границах; пусто/мусор — минимум. */
export function clampInt(v: string, min: number, max: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** Сколько штук ввёл человек. Больше потолка — ошибка с понятным текстом, а не
 *  молчаливая обрезка: раньше «10 000 золота» тихо превращалось в 1 000 (15.10). */
export function countOrThrow(v: string, max: number, tooMany: (max: number) => string): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > max) throw new Error(tooMany(max));
  return n;
}

/** 1 аукцион, 2 аукциона, 5 аукционов. */
export function aucWord(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "аукцион";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "аукциона";
  return "аукционов";
}

/** Числовое поле с подписью (штуки/лоты/копии). */
export function CountField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <div>
      <label className="auction-label">{label}</label>
      <input
        className="auction-field"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Выпадашка приза с миниатюрами — нативный <select> картинки не умеет. */
export function PrizePicker({
  options,
  value,
  onChange,
  placeholder = "— выбери —",
  empty = "Нет вариантов",
}: {
  options: PrizeOption[];
  value: string;
  onChange: (ref: string) => void;
  placeholder?: string;
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.ref === value);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="auction-picker" ref={box}>
      <button type="button" className="auction-picker__btn" onClick={() => setOpen((v) => !v)}>
        <span className="auction-picker__thumb relative">
          {selected?.image ? <img src={selected.image} alt="" /> : null}
          {selected?.durability != null && <ArtWearBar durability={selected.durability} />}
          <PrizeEnchant o={selected} />
        </span>
        <span className={`auction-picker__name${selected ? "" : " auction-picker__ph"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="auction-picker__chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="auction-picker__pop" role="listbox">
          {options.length === 0 && <div className="auction-picker__empty">{empty}</div>}
          {options.map((o) => (
            <button
              key={o.ref}
              type="button"
              className={`auction-picker__opt${o.ref === value ? " auction-picker__opt--on" : ""}`}
              onClick={() => {
                onChange(o.ref);
                setOpen(false);
              }}
            >
              <span className="auction-picker__thumb relative">
                {o.image ? <img src={o.image} alt="" /> : null}
                {o.durability != null && <ArtWearBar durability={o.durability} />}
                <PrizeEnchant o={o} />
              </span>
              <span className="auction-picker__name">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pills<T extends string | number>({
  value,
  options,
  onPick,
  fmt,
}: {
  value: T;
  options: readonly T[];
  onPick: (v: T) => void;
  fmt: (v: T) => string;
}) {
  return (
    <div className="auction-pills">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onPick(o)}
          className={`auction-pill${value === o ? " auction-pill--on" : ""}`}
        >
          {fmt(o)}
        </button>
      ))}
    </div>
  );
}
