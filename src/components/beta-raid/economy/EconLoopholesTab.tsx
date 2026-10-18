// Лазейки: карточки по видам (арбитраж / общая полка / энергия / только
// награды), внутри — игроки по убыванию балла, summary и раскрывающиеся
// details. Клик по имени — лента игрока под карточками. Это эвристики
// сервера, не приговор: балл говорит «посмотри сюда», а не «бан».
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EconRange, LoopholeKind, LoopholeRow } from "@/lib/econ/types";
import { adminEconLoopholes } from "@/server/api/beta-raid/econ/loopholes";
import { fmt } from "./economyFormat";
import { loopholeHint, loopholeLabel } from "./econLabels";
import { EconPlayerFeed, type FeedTarget } from "./EconPlayerFeed";
import { EconCell, EconEmpty, EconError, EconSpinner, PlayerName } from "./EconShared";

const KINDS: LoopholeKind[] = ["arbitrage", "shelf_taker", "energy_outlier", "reward_heavy"];

/** Числовые клетки арбитража из details (fromQ/fromR/toQ/toR), если они есть. */
function arbitrageCells(
  d: Record<string, number | string>,
): { fromQ: number; fromR: number; toQ: number; toR: number } | null {
  const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : NaN);
  const c = { fromQ: n("fromQ"), fromR: n("fromR"), toQ: n("toQ"), toR: n("toR") };
  return Object.values(c).every(Number.isFinite) ? c : null;
}

export function EconLoopholesTab({ range }: { range: EconRange }) {
  const t = useT();
  const [feed, setFeed] = useState<FeedTarget | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const q = useQuery({
    queryKey: ["admin-econ", "loopholes", range],
    queryFn: () => adminEconLoopholes({ data: { range } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const byKind = useMemo(() => {
    const m = new Map<LoopholeKind, LoopholeRow[]>();
    for (const k of KINDS) m.set(k, []);
    for (const r of q.data?.rows ?? []) {
      const list = m.get(r.kind);
      if (list) list.push(r);
      else m.set(r.kind, [r]);
    }
    for (const list of m.values()) list.sort((a, b) => b.score - a.score);
    return m;
  }, [q.data?.rows]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (q.isLoading) return <EconSpinner />;
  if (q.error) return <EconError error={q.error} />;
  if ((q.data?.rows.length ?? 0) === 0) return <EconEmpty text={t("econ.loop.empty")} />;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
        {[...byKind.entries()].map(([kind, rows]) => (
          <section key={kind} className="rounded-2xl border border-border bg-secondary/20">
            <header className="border-b border-border px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-sm font-bold text-gold">
                  {loopholeLabel(t, kind)}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">{loopholeHint(t, kind)}</div>
            </header>
            {rows.length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground">{t("econ.none")}</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {rows.map((r) => {
                  const key = `${kind}|${r.accountId}`;
                  const isOpen = open.has(key);
                  // Клетки покупки/продажи — кнопками «перейти», числа fromQ/… в
                  // списке деталей не показываем (они для кнопок).
                  const cells = arbitrageCells(r.details);
                  const details = Object.entries(r.details).filter(
                    ([k]) => !/^(from|to)[QR]$/.test(k),
                  );
                  return (
                    <Fragment key={key}>
                      <li
                        onClick={() => toggle(key)}
                        className={cn(
                          "cursor-pointer px-3 py-1.5 text-[12px] transition hover:bg-secondary/40",
                          isOpen && "bg-secondary/50",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <PlayerName
                            name={r.displayName}
                            onClick={() =>
                              setFeed({ accountId: r.accountId, displayName: r.displayName })
                            }
                          />
                          <span className="ml-auto shrink-0 rounded-md border border-amber-400/40 bg-amber-950/30 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-200">
                            {fmt(r.score)} {t("econ.loop.score")}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{r.summary}</div>
                      </li>
                      {isOpen && (
                        <li className="bg-secondary/20 px-3 py-2">
                          <div className="mb-1 text-[10px] uppercase text-muted-foreground">
                            {t("econ.loop.details")}
                          </div>
                          {cells && (
                            <div className="mb-1 text-[11px]">
                              <EconCell mapId={null} q={cells.fromQ} r={cells.fromR} />
                              <span className="mx-1 text-muted-foreground">→</span>
                              <EconCell mapId={null} q={cells.toQ} r={cells.toR} />
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                {t("econ.cell.from_to")}
                              </span>
                            </div>
                          )}
                          {details.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground">
                              {t("econ.none")}
                            </div>
                          ) : (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                              {details.map(([k, v]) => (
                                <Fragment key={k}>
                                  <dt className="text-muted-foreground">{k}</dt>
                                  <dd className="tabular-nums">
                                    {typeof v === "number" ? fmt(v) : v}
                                  </dd>
                                </Fragment>
                              ))}
                            </dl>
                          )}
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      {feed && <EconPlayerFeed target={feed} range={range} onClose={() => setFeed(null)} />}
    </div>
  );
}
