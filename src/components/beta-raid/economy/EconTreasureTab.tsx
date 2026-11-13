// «$ Экономика → Клад» (владелец 07.11.2026, §8.117): фонд призов заранее (один
// приз — один день) и закопанные клады — мир, координаты, приз, что с ним, скрин.
// Приз выбирается тем же блоком, что выплата лавки (MarketPriceFields).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { withoutUsdt } from "@/lib/usdtBanned";
import { mskText, prizeText } from "@/lib/treasure";
import type { MarketPriceResource } from "@/lib/marketItem";
import { listRewardTokens } from "@/server/api/admin-payouts";
import {
  addTreasurePrize,
  buryTreasureNow,
  deleteTreasurePrize,
  getTreasureAdmin,
  getTreasureShot,
  type TreasureView,
} from "@/server/api/treasure/treasure-admin";
import { MarketPriceFields } from "@/components/beta-raid/market/MarketPriceFields";

const KEY = ["admin-treasure"];

function Shot({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["admin-treasure-shot", id],
    queryFn: () => getTreasureShot({ data: { id } }),
    staleTime: Infinity,
  });
  if (!q.data) return <p className="px-2 py-2 text-[11px] text-muted-foreground">…</p>;
  return <img src={q.data} alt="" className="w-full max-w-md rounded-lg" />;
}

function Row({ x }: { x: TreasureView }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const status =
    x.status === "live"
      ? t("treasure.st_live", { t: mskText(Date.parse(x.until), lang) })
      : x.status === "found"
        ? t("treasure.st_found", { who: x.finder ? `@${x.finder}` : "—" })
        : t("treasure.st_expired");
  return (
    <>
      <tr className="border-b border-border/40">
        <td className="px-2 py-1 tabular-nums">{x.date}</td>
        <td className="px-2 py-1">
          {x.world} · {x.q},{x.r}
        </td>
        <td className="px-2 py-1">{prizeText(x, lang)}</td>
        <td className="px-2 py-1 text-muted-foreground">{status}</td>
        <td className="px-2 py-1 text-right">
          <button type="button" onClick={() => setOpen(!open)} className="text-primary">
            {t("treasure.shot")}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-2 py-2">
            <Shot id={x.id} />
          </td>
        </tr>
      )}
    </>
  );
}

export function EconTreasureTab() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => getTreasureAdmin() });
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = withoutUsdt((tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol));
  const [resource, setResource] = useState<MarketPriceResource>("gold");
  const [token, setToken] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const add = useMutation({
    mutationFn: () => addTreasurePrize({ data: { resource, token, amount } }),
    onSuccess: () => {
      toast.success(t("treasure.added"));
      setAmount(0);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  // «Админ может сам запустить, если что — живёт сутки» (владелец 07.11.2026).
  const bury = useMutation({
    mutationFn: () => buryTreasureNow(),
    onSuccess: () => {
      toast.success(t("treasure.buried"));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteTreasurePrize({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  if (!q.data)
    return <p className="p-3 text-xs text-muted-foreground">{q.error ? String(q.error) : "…"}</p>;
  const { fund, treasures } = q.data;
  const live = treasures.some((x) => x.status === "live");
  return (
    <div className="space-y-4 p-3 text-[11px]">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold">
            {t("treasure.fund")}
            {fund.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">
                {t("treasure.fund_days", { n: fund.length })}
              </span>
            )}
          </h3>
          <button
            type="button"
            disabled={bury.isPending || live || fund.length === 0}
            onClick={() => bury.mutate()}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] disabled:opacity-50"
          >
            {bury.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("treasure.bury_now")}
          </button>
        </div>
        {fund.length === 0 ? (
          <p className="text-muted-foreground">{t("treasure.fund_empty")}</p>
        ) : (
          <ol className="space-y-1">
            {fund.map((f, i) => (
              <li key={f.id} className="flex items-center gap-2">
                <span className="w-5 tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{prizeText(f, lang)}</span>
                {f.live ? (
                  <span className="text-primary">{t("treasure.buried_now")}</span>
                ) : (
                  <button
                    type="button"
                    aria-label="✕"
                    disabled={del.isPending}
                    onClick={() => del.mutate(f.id)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="max-w-md space-y-2 rounded-lg border border-border p-2">
          <MarketPriceFields
            sell
            noArtAny
            priceResource={resource}
            priceAmount={amount}
            priceToken={token}
            tokens={tokens}
            onResource={setResource}
            onAmount={setAmount}
            onToken={setToken}
          />
          <button
            type="button"
            disabled={add.isPending || !(amount > 0)}
            onClick={() => add.mutate()}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {add.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("treasure.add")}
          </button>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold">{t("treasure.list")}</h3>
        {treasures.length === 0 ? (
          <p className="text-muted-foreground">{t("treasure.none")}</p>
        ) : (
          <table className="min-w-full border-collapse">
            <tbody>
              {treasures.map((x) => (
                <Row key={x.id} x={x} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
