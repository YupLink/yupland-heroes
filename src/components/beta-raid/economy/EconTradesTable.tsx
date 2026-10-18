// Сырые сделки из trade_journal: время · игрок · сторона · товар · кол-во ·
// цена · где · контрагент. Заголовок липнет под панелью фильтра (h-12).
import { useLang, useT } from "@/lib/i18n";
import type { TradeRow } from "@/lib/econ/types";
import { fmt } from "./economyFormat";
import { counterpartyLabel, fmtWhen, sideLabel, sourceLabel } from "./econLabels";
import { EconCell, TH_UNDER_BAR } from "./EconShared";

const SIDE_COLOR: Record<TradeRow["side"], string> = {
  buy: "text-red-300",
  sell: "text-emerald-300",
  take: "text-amber-200",
  put: "text-sky-300",
  pay: "text-red-300",
  use: "text-red-300",
};

export function EconTradesTable({ rows }: { rows: TradeRow[] }) {
  const t = useT();
  const lang = useLang();
  return (
    <table className="min-w-full border-collapse text-[11px]">
      <thead className="text-[10px] uppercase text-muted-foreground">
        <tr>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.time")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.player")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.side")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.item")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.col.qty")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.col.price")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.where")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.col.counterparty")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/60">
            <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
              {fmtWhen(r.at, lang)}
            </td>
            <td className="max-w-[9rem] truncate px-2 py-1 font-semibold" title={r.accountId}>
              {r.displayName}
            </td>
            <td className="whitespace-nowrap px-2 py-1">
              <span className={SIDE_COLOR[r.side]}>{sideLabel(t, r.side)}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                {sourceLabel(t, r.source)}
              </span>
            </td>
            <td className="max-w-[10rem] truncate px-2 py-1" title={r.itemKey}>
              {r.itemName}
            </td>
            <td className="px-2 py-1 text-right tabular-nums">{fmt(r.qty)}</td>
            <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
              {r.priceUnit == null ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <>
                  {fmt(r.priceUnit)}
                  {r.total != null && (
                    <span className="text-muted-foreground"> = {fmt(r.total)}</span>
                  )}
                  {r.priceCur && (
                    <span className="ml-1 text-[10px] text-muted-foreground">{r.priceCur}</span>
                  )}
                </>
              )}
            </td>
            <td className="whitespace-nowrap px-2 py-1">
              <EconCell mapId={r.mapId} q={r.q} r={r.r} />
            </td>
            <td className="max-w-[8rem] truncate px-2 py-1 text-muted-foreground">
              {counterpartyLabel(t, r.counterparty, r.counterpartyName)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
