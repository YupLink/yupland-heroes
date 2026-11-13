// Статистика ставок «Короны гречневого королевства» — админу, поверх окна игры:
// сколько поставили и сколько выплачено за короны, итог игры, по игрокам. Золото и
// DARAI — раздельно (переключатель сверху); у DARAI — фонд игры и новые кошельки со ссылки.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { buckwheatStats } from "@/server/api/buckwheat/bwApi";
import { useT } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

export function BuckwheatStats({ onClose }: { onClose: () => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["bw-stats"], queryFn: () => buckwheatStats(), staleTime: 0 });
  const [cur, setCur] = useState<"gold" | "darai">("gold");
  const s = q.data?.[cur];
  const net = s ? s.staked - s.returned : 0;
  const cells: Array<[string, string]> = s
    ? [
        [t("bw.stats.games"), `${fmt(s.games)}${s.open ? ` (${fmt(s.open)})` : ""}`],
        [t("bw.stats.players"), fmt(s.players)],
        [t("bw.stats.staked"), fmt(s.staked)],
        [t("bw.stats.returned"), fmt(s.returned)],
        [t("bw.stats.net"), `${net >= 0 ? "+" : ""}${fmt(net)}`],
      ]
    : [];
  const f = q.data?.fund;
  // Фонд игры (buckwheat-05): ставки DARAI в него, выплаты за короны из него.
  if (cur === "darai" && f)
    cells.unshift(
      [t("bw.stats.fund"), fmt(f.balance)],
      [t("bw.stats.fund_in"), fmt(f.staked)],
      [t("bw.stats.fund_out"), fmt(f.paid)],
      [t("bw.stats.from_map"), fmt(f.fromMap)],
      [t("bw.stats.link_accounts"), fmt(f.linkAccounts)],
      [t("bw.stats.link_in"), fmt(f.linkDeposited)],
      [t("bw.stats.link_out"), fmt(f.linkWithdrawn)],
    );
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background/95 p-4 text-foreground">
      <div className="mx-auto max-w-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{t("bw.stats.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("bw.stats.close")}
            className="flex h-11 w-11 items-center justify-center rounded-lg border"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["gold", "darai"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cur === c}
              onClick={() => setCur(c)}
              className={`min-h-11 rounded-lg border text-sm font-semibold ${cur === c ? "border-gold text-gold" : "text-muted-foreground"}`}
            >
              {t(c === "gold" ? "bw.stats.gold" : "bw.stats.darai")}
            </button>
          ))}
        </div>
        {q.isError && <p className="text-sm text-destructive">{t("bw.stats.error")}</p>}
        {!s && !q.isError && <p className="text-sm text-muted-foreground">…</p>}
        {s && (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-2">
              {cells.map(([k, v]) => (
                <div key={k} className="rounded-lg border p-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">{t("bw.stats.player")}</th>
                  <th className="py-1 text-right font-normal">{t("bw.stats.games")}</th>
                  <th className="py-1 text-right font-normal">{t("bw.stats.staked")}</th>
                  <th className="py-1 text-right font-normal">{t("bw.stats.returned")}</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="max-w-[9rem] truncate py-1">{r.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(r.games)}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(r.staked)}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(r.returned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
