// Общее для окна храма: значки бонусов (те же, что у характеристик героя —
// statMeta) и ресурсов, ключ запроса, обратный отсчёт. Окно — значки и числа,
// слова — только в подсказке (владелец, 08.10.2026: «у тебя же есть иконки»).
import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { statMeta } from "@/components/itemStat";
import { STAT_LABEL, type TempleResource, type TempleStat } from "@/lib/castleTemple";

export const TEMPLE_KEY = ["castle-temple"] as const;

const STAT_KEY: Record<TempleStat, string> = {
  atk: "attack", arm: "armor", hp: "health", spd: "speed",
  luck: "luck", int: "intellect", trade: "trade", alchemy: "alchemy",
};

/** Значок характеристики в её цвете — как на карточке героя. */
export function StatGlyph({ stat, className = "h-5 w-5" }: { stat: TempleStat; className?: string }) {
  if (stat === "alchemy") return <FlaskConical className={className} style={{ color: "#c268ef" }} strokeWidth={2.5} aria-hidden />;
  const { Icon, color } = statMeta(STAT_KEY[stat]);
  return <Icon className={className} style={{ color }} strokeWidth={2.5} aria-hidden />;
}

export const statName = (s: TempleStat, ru: boolean) => STAT_LABEL[s][ru ? 0 : 1];

export const RES_ICON: Record<TempleResource, string> = {
  wood: "/resources/wood.webp",
  stone: "/resources/stone.webp",
  gold: "/resources/gold.webp",
  diamonds: "/resources/crystal.webp",
};

export const RES_LABEL: Record<TempleResource, [string, string]> = {
  wood: ["Дерево", "Wood"],
  stone: ["Камень", "Stone"],
  gold: ["Золото", "Gold"],
  diamonds: ["Кристаллы", "Crystals"],
};

/** «5:00», «3:20» — минуты и секунды. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Сколько осталось до момента (мс) — «4 ч 12 мин»; null — время пришло. */
export function useWaitText(at: number | null, ru: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [at]);
  if (!at || at <= now) return null;
  const sec = Math.ceil((at - now) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  if (ru) return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export const panel = "rounded-2xl border border-gold/25 bg-card/80 p-3.5";
export const heading = "font-display text-base font-bold text-gold";
export const goldButton =
  "min-h-11 w-full rounded-xl font-bold transition gradient-gold text-gold-foreground disabled:bg-none disabled:bg-secondary/60 disabled:text-muted-foreground";
