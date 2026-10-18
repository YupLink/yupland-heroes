// Лента одного игрока: все движения по всем леджерам за окно, новые сверху.
// Открывается ПОД таблицей Дельт/Лазеек (не модалкой — панель и так inline
// под картой, ещё один слой поверх был бы третьим этажом). «Ещё» листает
// по nextCursor сервера.
import { useInfiniteQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { EconRange, FeedReport } from "@/lib/econ/types";
import { adminEconFeed } from "@/server/api/beta-raid/econ/feed";
import { econCurrencyLabel, fmtWhen, groupLabel, ledgerLabel } from "./econLabels";
import { EconCell, EconEmpty, EconError, EconMore, EconSpinner, Signed, TH } from "./EconShared";

export type FeedTarget = { accountId: string; displayName: string };

const PAGE = 100;

export function EconPlayerFeed({
  target,
  range,
  onClose,
}: {
  target: FeedTarget;
  range: EconRange;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();

  const q = useInfiniteQuery({
    queryKey: ["admin-econ", "feed", range, target.accountId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminEconFeed({
        data: { accountId: target.accountId, range, cursor: pageParam ?? undefined, limit: PAGE },
      }),
    getNextPageParam: (last: FeedReport) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const pages = q.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.rows);
  const name = pages[0]?.displayName ?? target.displayName;

  return (
    <section className="m-2 rounded-2xl border border-gold/40 bg-secondary/20">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-bold text-gold">
            {t("econ.feed.title", { name })}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{target.accountId}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("econ.close")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {q.isLoading ? (
        <EconSpinner />
      ) : q.error ? (
        <EconError error={q.error} />
      ) : rows.length === 0 ? (
        <EconEmpty text={t("econ.feed.empty")} />
      ) : (
        <table className="min-w-full border-collapse text-[11px]">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className={`${TH} text-left`}>{t("econ.col.time")}</th>
              <th className={`${TH} text-left`}>{t("econ.col.ledger")}</th>
              <th className={`${TH} text-left`}>{t("econ.col.currency")}</th>
              <th className={`${TH} text-right`}>±</th>
              <th className={`${TH} text-left`}>{t("econ.col.kind")}</th>
              <th className={`${TH} text-left`}>{t("econ.col.where")}</th>
              <th className={`${TH} text-left`}>{t("econ.col.note")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.at}:${r.ledger}:${i}`} className="border-b border-border/60">
                <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                  {fmtWhen(r.at, lang)}
                </td>
                <td className="whitespace-nowrap px-2 py-1">{ledgerLabel(t, r.ledger)}</td>
                <td className="whitespace-nowrap px-2 py-1">{econCurrencyLabel(t, r.currency)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-semibold">
                  <Signed v={r.delta} />
                </td>
                <td className="whitespace-nowrap px-2 py-1">
                  <span>{groupLabel(t, r.group)}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">{r.kind}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-1">
                  <EconCell
                    mapId={r.place?.mapId ?? null}
                    q={r.place?.q ?? null}
                    r={r.place?.r ?? null}
                  />
                </td>
                <td
                  className="max-w-[18rem] truncate px-2 py-1 text-muted-foreground"
                  title={r.note ?? r.ref ?? ""}
                >
                  {r.note ?? r.ref ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {q.hasNextPage && (
        <EconMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} />
      )}
    </section>
  );
}
