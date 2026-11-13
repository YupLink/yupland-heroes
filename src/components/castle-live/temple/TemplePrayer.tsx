// Молитва: плитки бонусов (значок и сила), выбор до числа слотов; при 2+ —
// «+10 мин за 100 ★»; перед подтверждением — что и на сколько (владелец, 07.10.2026).
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { prayCastleTemple } from "@/server/api/castle-temple";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import {
  EXTENDED_MINUTES,
  PRAYER_MINUTES,
  TEMPLE_STATS,
  bonusValue,
  prayerPlan,
  type PrayerBonus,
  type TemplePoints,
  type TempleStat,
} from "@/lib/castleTemple";
import { StatGlyph, TEMPLE_KEY, clock, goldButton, heading, panel, statName, useWaitText } from "./templeUi";

/** Выбранные бонусы строкой плашек: значок, сила, время. */
function Picked({ bonuses, ru }: { bonuses: PrayerBonus[]; ru: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bonuses.map((b) => (
        <span key={b.stat} title={statName(b.stat, ru)} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2 py-1 text-sm tabular-nums">
          <StatGlyph stat={b.stat} className="h-4 w-4" />+{b.value}
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <Clock3 className="h-3 w-3" aria-hidden />
            {clock(b.seconds)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function TemplePrayer({
  ru,
  points,
  slots,
  prayAt,
  atCastle,
  extendStars,
  stars = true,
}: {
  ru: boolean;
  points: TemplePoints;
  slots: number;
  prayAt: number | null;
  atCastle: boolean;
  extendStars: number;
  /** false — аккаунт без настоящего Telegram (§8.127): продления за звёзды нет. */
  stars?: boolean;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<TempleStat[]>([]);
  const [extend, setExtend] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Нажали «Помолиться», ничего не выбрав, — подсветить плитки бонусов.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(false), 1600);
    return () => clearTimeout(id);
  }, [hint]);
  const wait = useWaitText(prayAt, ru);
  // Продление — только при 2+ бонусах; меньше — снимается само.
  useEffect(() => {
    if (picked.length < 2 && extend) setExtend(false);
  }, [picked.length, extend]);
  const plan = prayerPlan(picked, points, extend);
  const pray = useMutation({
    mutationFn: () => prayCastleTemple({ data: { stats: picked, extend: plan.extended, opId: newOpId() } }),
    onSuccess: () => {
      toast.success(ru ? "Храм услышал молитву" : "The temple heard your prayer");
      setConfirm(false);
      setPicked([]);
      void qc.invalidateQueries({ queryKey: TEMPLE_KEY });
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      if (plan.extended) void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const toggle = (s: TempleStat) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length < slots ? [...p, s] : p));

  return (
    <section className={panel}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={heading}>{ru ? "Молитва" : "Prayer"}</h2>
        <span className="inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <span>{picked.length}/{slots}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {plan.totalMinutes} {ru ? "мин" : "min"}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {TEMPLE_STATS.map((s) => {
          const v = bonusValue(s, points[s] ?? 0);
          const on = picked.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={`${statName(s, ru)} +${v}`}
              title={statName(s, ru)}
              disabled={!on && (picked.length >= slots || v <= 0)}
              onClick={() => toggle(s)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm font-bold tabular-nums transition disabled:opacity-35",
                on ? "border-gold bg-gold/15 text-gold" : "border-border/70 bg-secondary/40",
                hint && !on && "animate-pulse border-gold/70",
              )}
            >
              <StatGlyph stat={s} />+{v}
            </button>
          );
        })}
      </div>
      {stars && picked.length >= 2 && (
        <button
          type="button"
          aria-pressed={extend}
          onClick={() => setExtend((v) => !v)}
          className={cn(
            "mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold",
            extend ? "border-gold bg-gold/15 text-gold" : "border-gold/30 text-muted-foreground",
          )}
        >
          <Clock3 className="h-4 w-4" aria-hidden />+{EXTENDED_MINUTES - PRAYER_MINUTES} {ru ? "мин" : "min"} · {extendStars} ★
        </button>
      )}
      {plan.bonuses.length > 0 && !confirm && <div className="mt-2"><Picked bonuses={plan.bonuses} ru={ru} /></div>}
      {wait ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          {wait}
        </p>
      ) : !atCastle ? (
        <p className="mt-3 text-sm text-muted-foreground">{ru ? "Герой не в замке" : "Hero is not at the castle"}</p>
      ) : confirm ? (
        <div className="mt-3 space-y-2 rounded-xl border border-gold/40 bg-background/60 p-3">
          <p className="text-sm font-semibold">{ru ? "Подтвердить молитву?" : "Confirm prayer?"}</p>
          <Picked bonuses={plan.bonuses} ru={ru} />
          {plan.extended && <p className="text-xs text-gold">−{extendStars} ★</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="min-h-11 flex-1 rounded-xl border border-border">
              {ru ? "Отмена" : "Cancel"}
            </button>
            <button type="button" disabled={pray.isPending} onClick={() => pray.mutate()} className={cn(goldButton, "flex-1")}>
              {pray.isPending ? "…" : ru ? "Подтвердить" : "Confirm"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            // Кнопка не гаснет: без выбора она подсказывает, что выбрать.
            if (plan.bonuses.length > 0) return setConfirm(true);
            setHint(true);
            toast.info(ru ? `Выберите бонус — до ${slots}` : `Pick a bonus — up to ${slots}`);
          }}
          className={cn(goldButton, "mt-3")}
        >
          {ru ? "Помолиться" : "Pray"}
        </button>
      )}
    </section>
  );
}
