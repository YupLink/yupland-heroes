// /admin/passport — паспорт аккаунта (владелец, 06.11.2026): по каждому аккаунту его
// Telegram, кошельки и Google в параллельных колонках; отдельный список — Telegram, у
// которых два аккаунта и больше. Только чтение. Сервер — passportAdmin.ts.
import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IdCard } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { adminPassport, type PassportRow } from "@/server/api/passport/passportAdmin";
import { PASSPORT_COLS, PassportRowView } from "./PassportRowView";

type Mode = "recent" | "twins";
const MODES: Mode[] = ["recent", "twins"];
/** Только то, что пропустит сервер: буквы, цифры, _ . @ - и пробел. */
const cleanQuery = (v: string) => v.replace(/[^\p{L}0-9_.@\- ]/gu, "").slice(0, 64);

/** Режим «два аккаунта»: сервер отдаёт строки подряд по Telegram — собираем в группы. */
function groupByTg(rows: PassportRow[]) {
  const groups: { tg: string; label: string; rows: PassportRow[] }[] = [];
  for (const r of rows) {
    const tg = r.tg ?? r.id;
    const last = groups[groups.length - 1];
    if (last?.tg === tg) last.rows.push(r);
    else groups.push({ tg, label: r.username ? `@${r.username}` : tg, rows: [r] });
  }
  return groups;
}

export function PassportCard() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("recent");
  const [text, setText] = useState("");
  const q = useDeferredValue(text.trim());
  const res = useQuery({
    queryKey: ["admin-passport", mode, q],
    queryFn: () => adminPassport({ data: { mode, q } }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const d = res.data;
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      aria-labelledby="passport-title"
    >
      <h2
        id="passport-title"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <IdCard className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("passport.title")}
      </h2>
      {d && (
        <div className="space-y-0.5 text-sm">
          <p className="text-muted-foreground">{t("passport.summary", d.summary)}</p>
          <p
            className={
              d.summary.twinTg > 0 ? "font-semibold text-destructive" : "text-muted-foreground"
            }
          >
            {t("passport.twin_tg", { n: d.summary.twinTg })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${mode === m ? "border-gold text-gold" : "border-border"}`}
          >
            {t(`passport.mode_${m}`)}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(cleanQuery(e.target.value))}
        placeholder={t("passport.search")}
        aria-label={t("passport.search")}
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {res.isPending ? (
        <p role="status" className="text-sm">
          {t("google.loading")}
        </p>
      ) : res.isError || !d ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{humanError(res.error)}</p>
          <button
            type="button"
            onClick={() => void res.refetch()}
            className="min-h-11 rounded-lg border border-border px-3 py-2"
          >
            {t("google.retry")}
          </button>
        </div>
      ) : d.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("passport.nothing")}</p>
      ) : (
        <div
          aria-busy={res.isPlaceholderData}
          className={`rounded-xl border border-border transition-opacity ${res.isPlaceholderData ? "opacity-40" : ""}`}
        >
          <div
            className={`hidden border-b border-border p-3 text-xs text-muted-foreground ${PASSPORT_COLS}`}
          >
            <span>{t("passport.col_account")}</span>
            <span>{t("passport.col_tg")}</span>
            <span>{t("passport.col_wallets")}</span>
            <span>{t("passport.col_google")}</span>
          </div>
          <ul className="divide-y divide-border">
            {mode === "twins"
              ? groupByTg(d.rows).map((g) => (
                  <li key={g.tg}>
                    <p className="px-3 pt-3 text-sm font-semibold text-destructive">
                      {t("passport.group", { tg: g.label, n: g.rows[0].twins.length + 1 })}
                    </p>
                    <ul>
                      {g.rows.map((r) => (
                        <PassportRowView key={r.id} row={r} inGroup />
                      ))}
                    </ul>
                  </li>
                ))
              : d.rows.map((r) => <PassportRowView key={r.id} row={r} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
