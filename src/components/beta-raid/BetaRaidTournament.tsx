// Турнир бета-рейда — по образцу raid/RaidTournament.tsx: сворачиваемый блок,
// бейдж своего места в шапке, подсветка своей строки, догрузка по 20.
import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLang } from "@/lib/i18n";
import { getBetaRaidTournament } from "@/server/api/beta-raid";

const PAGE = 20;

/** `defaultOpen` — раскрыть таблицу сразу (окно «Слава» в замке); на экране рейда свёрнута. */
function BetaRaidTournamentView({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const t = useT();
  const ru = useLang() === "ru";
  const [open, setOpen] = useState(defaultOpen);
  const [visible, setVisible] = useState(PAGE);
  const tourQ = useQuery({
    queryKey: ["beta-raid-tournament"],
    queryFn: () => getBetaRaidTournament(),
    enabled: open,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const players = tourQ.data?.players ?? [];
  const myRank = tourQ.data?.myRank ?? null;
  const rest = players.length - visible;

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setVisible(PAGE);
        }}
        className="flex w-full items-center gap-2 text-left"
      >
        <Trophy className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-sm font-semibold">{t("raid.tournament")}</span>
        <span className="text-xs text-muted-foreground">{t("braid.by_damage")}</span>
        {myRank != null && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-bold text-gold">
            #{myRank}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition",
            myRank == null && "ml-auto",
            open && "rotate-180 text-gold",
          )}
        />
      </button>

      {open && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Swords className="h-3.5 w-3.5 text-neon" /> {t("braid.tour_by_objects")}
            {players.length > 0 && (
              <span className="ml-auto rounded-full border border-gold/30 bg-gold/10 px-2 text-[10px] font-bold text-gold">
                {players.length}
              </span>
            )}
          </div>

          {tourQ.isError ? (
            <div role="alert" className="space-y-2">
              <p>{ru ? "Не удалось загрузить рейтинг." : "Could not load ranking."}</p>
              <button className="min-h-11 rounded border px-3" onClick={() => void tourQ.refetch()}>
                {ru ? "Повторить" : "Retry"}
              </button>
            </div>
          ) : tourQ.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : players.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 py-3 text-center text-[11px] text-muted-foreground">
              {t("braid.tour_empty")}
            </div>
          ) : (
            <div className="space-y-0.5">
              {players.slice(0, visible).map((p) => (
                <TournamentRow
                  key={p.wallet}
                  place={p.place}
                  name={p.name}
                  total={p.totalDamage}
                  mine={p.mine}
                  youLabel={t("raid.you_label")}
                />
              ))}
              {rest > 0 && (
                <button
                  onClick={() => setVisible(visible + PAGE)}
                  className="mt-1 w-full rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10"
                >
                  {t("braid.tour_more", { n: Math.min(PAGE, rest), total: rest })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Строка таблицы: место, имя, урон. Своя строка подсвечена золотом. */
function TournamentRow({
  place,
  name,
  total,
  mine,
  youLabel,
}: {
  place: number;
  name: string;
  total: number;
  mine: boolean;
  /** «ты»/«you» — берём из словаря в родителе, чтобы не звать хук на строку. */
  youLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded px-2 py-1 text-[13px]",
        mine ? "bg-gold/10" : "odd:bg-secondary/40",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "w-6 shrink-0 font-display font-bold tabular-nums",
            place === 1 ? "text-gold" : place <= 3 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          #{place}
        </span>
        <span
          className={cn("truncate", mine ? "font-semibold text-gold" : "text-muted-foreground")}
        >
          {name}
          {mine ? ` (${youLabel})` : ""}
        </span>
      </span>
      <span className="shrink-0 font-display font-medium tabular-nums text-foreground">
        {total.toLocaleString()}
      </span>
    </div>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const BetaRaidTournament = memo(BetaRaidTournamentView);
