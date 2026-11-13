// Одна строка паспорта: аккаунт | Telegram | кошельки | Google. На телефоне — столбиком
// с подписями, на широком экране — колонками под общей шапкой (PassportCard).
import type { ReactNode } from "react";
import { useLang, useT } from "@/lib/i18n";
import type { PassportRow } from "@/server/api/passport/passportAdmin";
import { PassportWithdraw } from "./PassportWithdraw";

export const PASSPORT_COLS = "sm:grid sm:grid-cols-[1.1fr_1fr_1.5fr_1fr] sm:gap-3";

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 sm:block">
      <span className="w-20 shrink-0 text-xs text-muted-foreground sm:hidden">{label}</span>
      <div className="min-w-0 break-all text-xs">{children}</div>
    </div>
  );
}

const dash = <span className="text-muted-foreground">—</span>;

/** inGroup — строка внутри группы «один Telegram»: счётчик аккаунтов уже в заголовке группы. */
export function PassportRowView({ row, inGroup = false }: { row: PassportRow; inGroup?: boolean }) {
  const t = useT();
  const ru = useLang() === "ru";
  const seen = row.lastSeenAt
    ? t("passport.seen", {
        date: new Date(row.lastSeenAt).toLocaleDateString(ru ? "ru-RU" : "en-US", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
      })
    : t("passport.not_seen");
  return (
    <li className="space-y-1 p-3">
      <div className={`space-y-1 sm:space-y-0 ${PASSPORT_COLS}`}>
        <Cell label={t("passport.col_account")}>
          <span className="font-mono">{row.id}</span>
          <span className="block whitespace-nowrap text-muted-foreground">{seen}</span>
          {row.archivedInto && (
            <span className="block text-muted-foreground">
              {t("passport.archived", { id: row.archivedInto })}
            </span>
          )}
        </Cell>
        <Cell label={t("passport.col_tg")}>
          {row.tg ? (
            <>
              <span className="font-mono">{row.tg}</span>
              {row.username && <span className="ml-1 text-muted-foreground">@{row.username}</span>}
            </>
          ) : row.noTg ? (
            <span className="text-muted-foreground">{t(`passport.no_tg_${row.noTg}`)}</span>
          ) : (
            dash
          )}
        </Cell>
        <Cell label={t("passport.col_wallets")}>
          {row.wallets.length === 0
            ? dash
            : row.wallets.map((w) => (
                <span key={w.wallet} className="mr-2 inline-block">
                  <span className="font-mono">{w.wallet}</span>
                  {!w.signed && (
                    <span className="ml-1 text-muted-foreground">({t("passport.unsigned")})</span>
                  )}
                  {w.off && (
                    <span className="ml-1 text-muted-foreground">({t("passport.off")})</span>
                  )}
                </span>
              ))}
        </Cell>
        <Cell label={t("passport.col_google")}>{row.google ?? dash}</Cell>
      </div>
      <PassportWithdraw account={row.id} on={row.withdraw} />
      {!inGroup && row.twins.length > 0 && (
        <p className="text-xs font-semibold text-destructive">
          {t("passport.twins", { n: row.twins.length + 1 })}
        </p>
      )}
    </li>
  );
}
