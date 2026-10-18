// Итог боя: одна строка значков + раскрывающиеся раунды.
//
// Значок = что сработало, число = сколько. Расшифровка — по тапу, чтобы в
// свёрнутом виде не было ни одного лишнего слова.
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { formatEnergyCost } from "@/lib/shipRules";
import type { Lang } from "@/lib/store";
import { effectMeta, plural, type TFn } from "./effectMeta";
import { RoundTable, type AbilityEvent, type RoundEntry } from "./BetaFightRounds";

/** Как копить: урон/энергию — суммой, попадания — счётом, надбавку — максимумом. */
const AGG: Record<string, "sum" | "count" | "max"> = {
  // Яд — дебафф, а не урон: считаем, скольким фишкам его повесили.
  poison: "count",
  burn_energy: "sum",
  stun: "count",
  cleave: "count",
  slow: "max",
  // Крит и уворот подписаны в таблице раундов — в верхнем ряду их не было,
  // и единственное, что видно от героя в бою, туда не попадало.
  hero_crit: "count",
  hero_miss: "count",
  // Ослабление героя: сервер шлёт то, что реально повисло (среднее по времени,
  // encounter-ability-totals). Раньше видов тут не было, и фильтр `!!AGG[kind]`
  // молча выбрасывал их из верхнего ряда — «новые дебафы не отображаются».
  weak_atk: "max",
  weak_arm: "max",
  weak_luck: "max",
  weak_int: "max",
};

const BADGE: Record<string, (n: number) => string> = {
  poison: (n) => `×${n}`,
  // Энергия дробная: без формата в значок лез «−12.600000000000001».
  burn_energy: (n) => `−${formatEnergyCost(n)}`,
  stun: (n) => `×${n}`,
  cleave: (n) => `×${n}`,
  slow: (n) => `+${n}`,
  hero_crit: (n) => `×${n}`,
  hero_miss: (n) => `×${n}`,
  weak_atk: (n) => `−${n}`,
  weak_arm: (n) => `−${n}`,
  weak_luck: (n) => `−${n}`,
  weak_int: (n) => `−${n}`,
};

/**
 * В расшифровке значок считает СОБЫТИЯ, поэтому слово ставим во множественном
 * («Криты — 3», а не «Крит — 3»). Значок и цвет остаются из effectMeta.
 */
const HERO_PLURAL: Record<string, string> = {
  hero_crit: "braid.pl_crit",
  hero_miss: "braid.pl_miss",
};

/** Расшифровка значка: «3 фишки отравлены», «−12 энергии». */
function detailText(kind: string, n: number, t: TFn, lang: Lang): string {
  switch (kind) {
    case "poison":
      return plural(t, lang, "braid.pl_chip_poisoned", n);
    case "burn_energy":
      return t("braid.sum_energy_burned", { n: formatEnergyCost(n) });
    case "stun":
      return plural(t, lang, "braid.pl_chip", n);
    case "cleave":
      return plural(t, lang, "braid.pl_round", n);
    case "slow":
      return t("braid.sum_slow_step", { n });
    case "weak_atk":
    case "weak_arm":
    case "weak_luck":
    case "weak_int":
      return t(`braid.eff_${kind}`, { n });
    default:
      return String(n);
  }
}

export function BetaFightSummary({
  log: logRaw,
  abilityLog: abilityLogRaw,
  totals: totalsRaw,
  rounds: roundsTotal,
  wiped,
}: {
  log?: unknown;
  abilityLog?: unknown;
  /** Итоги от сервера. Лог доезжает обрезанным, а выжигание он считает по факту. */
  totals?: unknown;
  /** Сколько раундов было на самом деле — в логе их может быть меньше. */
  rounds?: number;
  wiped?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [rounds, setRounds] = useState(false);
  const t = useT();
  const lang = useLang();
  // Ответ боя лежит у игрока в кэше сутки: после выката, где формат менялся,
  // там встречается старая форма. Не доверяем ей — проверяем.
  const log: RoundEntry[] = Array.isArray(logRaw) ? (logRaw as RoundEntry[]) : [];
  const abilityLog: AbilityEvent[] = Array.isArray(abilityLogRaw)
    ? (abilityLogRaw as AbilityEvent[])
    : [];

  const totals = useMemo(() => {
    // Сервер прислал итоги — верим только им: по обрезанному логу счётчики
    // соврут, а выжигание в логе — накрутка способности, а не списанное.
    if (totalsRaw && typeof totalsRaw === "object") {
      return Object.entries(totalsRaw as Record<string, unknown>)
        .map(([kind, v]) => [kind, Number(v)] as [string, number])
        .filter(([kind, n]) => !!AGG[kind] && Number.isFinite(n) && n > 0);
    }
    // Ответ старого формата из кэша игрока — считаем по логу, как раньше.
    const map = new Map<string, number>();
    for (const e of abilityLog) {
      const kind = e.kind === "poison_applied" ? "poison" : e.kind;
      const mode = AGG[kind];
      if (!mode) continue;
      const prev = map.get(kind) ?? 0;
      map.set(
        kind,
        mode === "count" ? prev + 1 : mode === "max" ? Math.max(prev, e.amount) : prev + e.amount,
      );
    }
    return [...map].filter(([, n]) => n > 0);
  }, [abilityLog, totalsRaw]);

  const rows = useMemo(() => {
    const by = new Map<number, AbilityEvent[]>();
    for (const e of abilityLog) {
      const cur = by.get(e.round) ?? [];
      cur.push(e);
      by.set(e.round, cur);
    }
    return log.map((l) => ({ ...l, taken: l.targetDmg, ev: by.get(l.round) ?? [] }));
  }, [log, abilityLog]);

  if (totals.length === 0 && rows.length === 0) return null;
  const detail = totals.find(([k]) => k === open) ?? null;

  return (
    <div className="mt-3">
      {(totals.length > 0 || wiped) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {wiped && (
            <span className="rounded-full bg-destructive/15 px-2 py-1 text-[11px] font-bold text-destructive">
              {t("braid.squad_wiped")}
            </span>
          )}
          {totals.map(([kind, n]) => {
            const { Icon, color, label } = effectMeta(kind, t);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setOpen(open === kind ? null : kind)}
                aria-label={label}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold tabular-nums transition active:scale-95",
                  open === kind
                    ? "border-current bg-foreground/10"
                    : "border-transparent bg-secondary/50",
                )}
                style={{ color }}
              >
                <Icon className="h-3.5 w-3.5" />
                {(BADGE[kind] ?? String)(n)}
              </button>
            );
          })}
        </div>
      )}

      {detail && (
        <div className="mt-2 flex items-baseline gap-2 text-xs">
          <b style={{ color: effectMeta(detail[0], t).color }}>
            {HERO_PLURAL[detail[0]] ? t(HERO_PLURAL[detail[0]]) : effectMeta(detail[0], t).label}
          </b>
          <span className="text-muted-foreground">{detailText(detail[0], detail[1], t, lang)}</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setRounds((v) => !v)}
            className="mt-2 flex w-full items-center justify-between rounded-xl bg-secondary/30 px-2.5 py-2 text-xs text-muted-foreground"
          >
            <span>{t("braid.rounds_n", { n: roundsTotal ?? rows.length })}</span>
            <ChevronDown className={cn("h-4 w-4 transition", rounds && "rotate-180")} />
          </button>
          {rounds && <RoundTable rows={rows} />}
        </>
      )}
    </div>
  );
}
