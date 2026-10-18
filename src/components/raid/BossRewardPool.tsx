// Награды босса — столбиком по местам: на какое место что достаётся.
//
// Было: фонд одной кучей («250 лайков», «пак до места 10») и отдельной
// россыпью проценты «1 25% 2 15% …» — свою долю игрок считал в уме.
// Стало: строка на место — доля фонда и конкретная награда.
import { useState } from "react";
import { Gift, ChevronDown } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { prizeIcon, prizeImage } from "@/lib/prizeIcon";
import { rewardKindLabelKey } from "@/lib/rewardKinds";
import {
  rewardByPlace,
  paidPlaces,
  pctLabel,
  shortAmount,
  type PlaceReward,
} from "@/lib/rewardByPlace";
import type { RewardCfg } from "./raid-screen-types";

/**
 * Вид награды понятен по иконке; у токенов (DARAI и пр.) нужен тикер.
 * Ресурсы сюда же: у них свой спрайт, и слово «золото» рядом с монетой — шум,
 * который на 360 px отъедает строку. Название остаётся в подсказке.
 */
const NAMED_BY_ICON = new Set(["likes", "energy", "tickets", "gold", "stone", "wood", "diamonds"]);

/** Награда одного места: делимое (лайки/энергия/токены/ресурсы) + штучные призы. */
function PrizeList({ row, locale }: { row: PlaceReward; locale: string }) {
  const t = useT();
  /** Подпись вида: у ресурса — перевод, у токена — сам тикер. */
  const kindLabel = (kind: string, resource?: string | null): string => {
    // resource-код (gold/stone/…) передаём вторым аргументом, чтобы
    // rewardKindLabelKey мог сопоставить его с LABEL_KEY.
    const key = rewardKindLabelKey(kind, resource ?? undefined);
    return key ? t(key) : kind;
  };
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
      {row.fillers.map((f, i) => {
        const { Icon, color } = prizeIcon(f.kind);
        const img = prizeImage(f.kind);
        return (
          <span
            key={`f${i}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums"
            style={{ color }}
            title={kindLabel(f.kind, f.resource)}
          >
            {img ? (
              <img src={img} alt="" className="h-4 w-4 shrink-0 object-contain" />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" />
            )}
            {shortAmount(f.amount, locale)}
            {!NAMED_BY_ICON.has(f.kind) && <span className="font-normal">{kindLabel(f.kind, f.resource)}</span>}
          </span>
        );
      })}
      {row.prizes.map((p, i) => {
        const { Icon, color } = prizeIcon(p.kind);
        return (
          <span
            key={`p${i}`}
            className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-foreground/80"
            title={p.name}
          >
            {p.imageUrl ? (
              <img
                src={thumb(p.imageUrl, 32)}
                alt=""
                className="h-4 w-4 shrink-0 rounded object-cover"
              />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
            )}
            <span className="max-w-[7.5rem] truncate">{p.name}</span>
            {p.amount > 1 && <span className="shrink-0 tabular-nums">×{p.amount}</span>}
          </span>
        );
      })}
    </span>
  );
}

/** Одна строка столбика: место · доля фонда · что получает. */
function PlaceRow({ row, locale }: { row: PlaceReward; locale: string }) {
  const top = row.place === 1;
  return (
    <div className={cn("flex items-center gap-2 px-2.5 py-1.5", top && "bg-gold/[0.06]")}>
      <span
        className={cn(
          "w-5 shrink-0 font-display text-xs font-bold tabular-nums",
          top ? "text-gold" : row.place <= 3 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {row.place}
      </span>
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {pctLabel(row.sharePct, locale)}
      </span>
      <PrizeList row={row} locale={locale} />
    </div>
  );
}

export function BossRewardPool({
  cfg,
  /** Заголовок блока: по умолчанию «Награды за босса». */
  title,
}: {
  cfg: RewardCfg;
  title?: string;
}) {
  const t = useT();
  const locale = useLang() === "en" ? "en-US" : "ru-RU";
  const [open, setOpen] = useState(false);
  const rows = rewardByPlace(cfg);
  if (rows.length === 0) return null;
  const places = paidPlaces(cfg?.split);
  return (
    <div className="rounded-2xl border border-gold/20 bg-card p-4 shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Gift className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-sm font-semibold">{title ?? t("raid.boss_rewards")}</span>
        <span className="text-xs text-muted-foreground">{t("raid.by_place")}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180 text-gold",
          )}
        />
      </button>
      {open && (
        <div className="mt-3">
          {/* На сколько мест делится фонд — дальше построчно, кому сколько. */}
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("raid.pool_split_top", { n: places })}
          </div>
          {/* Без собственной прокрутки: блок живёт внутри модалки боя, а
              вложенный скролл с overscroll-contain не давал бы листать окно. */}
          <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-secondary/20">
            {rows.map((r) => (
              <PlaceRow key={r.place} row={r} locale={locale} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
