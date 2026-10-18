// Цепочки «купил → продал»: один игрок, один товар, за окно. Строка читается
// как фраза: «Вася · Молоко · купил 12 за 480 gold в 28,45 → продал 12 за 720
// gold в 31,40 · +240 gold». Места с числом сделок, если их несколько.
import { useT } from "@/lib/i18n";
import type { ChainLeg, ChainRow } from "@/lib/econ/types";
import { fmt } from "./economyFormat";
import { counterpartyLabel } from "./econLabels";
import { EconCell, Signed } from "./EconShared";

function LegPlaces({ leg }: { leg: ChainLeg }) {
  const t = useT();
  if (leg.places.length === 0) return null;
  return (
    <span className="text-muted-foreground">
      {" "}
      {t("econ.chain.at")}{" "}
      {leg.places.map((p, i) => (
        <span key={`${p.mapId ?? ""}:${p.q ?? "-"}:${p.r ?? "-"}:${i}`}>
          {i > 0 && ", "}
          <EconCell mapId={p.mapId} q={p.q} r={p.r} />
          {p.n > 1 && <span className="opacity-70">×{p.n}</span>}
          {p.counterparty && (
            <span className="opacity-70"> ({counterpartyLabel(t, p.counterparty, null)})</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function EconChainsList({
  chains,
  onPlayer,
}: {
  chains: ChainRow[];
  onPlayer?: (c: ChainRow) => void;
}) {
  const t = useT();
  if (chains.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-muted-foreground">{t("econ.no_chains")}</div>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {chains.map((c) => (
        <li
          key={`${c.accountId}|${c.itemKey}`}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-3 py-1.5 text-[12px]"
        >
          <button
            type="button"
            onClick={onPlayer ? () => onPlayer(c) : undefined}
            className="max-w-[9rem] truncate font-semibold text-gold underline-offset-2 hover:underline"
            title={c.accountId}
          >
            {c.displayName}
          </button>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">{c.itemName}</span>
          <span className="text-muted-foreground">·</span>
          <span>
            {t("econ.chain.bought", {
              n: fmt(c.buys.qty),
              total: fmt(c.buys.total),
              cur: c.buys.cur ?? "",
            })}
            <LegPlaces leg={c.buys} />
          </span>
          <span className="text-muted-foreground">→</span>
          <span>
            {t("econ.chain.sold", {
              n: fmt(c.sells.qty),
              total: fmt(c.sells.total),
              cur: c.sells.cur ?? "",
            })}
            <LegPlaces leg={c.sells} />
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">
            <Signed v={c.margin} />
            {c.margin != null && c.marginCur && (
              <span className="ml-1 text-[10px] text-muted-foreground">{c.marginCur}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
