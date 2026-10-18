// Лицензии банка на продажу золота за DARAI (пока только админ): статус текущей
// (купленной или по подписке на энергию), балансы, три ступени. Платить можно DARAI,
// долларами (USDT со счёта) или алмазами; цены фиксированные (lib/bankLicense).
// Покупка — двумя нажатиями, с ценой с экрана (не совпала — сервер откажет). Та же
// ступень — продление купленной, другая — замена с этой минуты. Оформление — окна аукциона.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScrollText, ShieldCheck, ShieldOff } from "lucide-react";
import { buyBankLicense, getBankLicense } from "@/server/api/bank/bank-license";
import {
  LICENSE_DAYS,
  LICENSE_TIERS,
  licenseActive,
  licenseTier,
  purchaseKind,
  type LicenseCurrency,
  type LicenseTier,
} from "@/lib/bankLicense";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { CASTLE_BANK_KEY } from "@/components/castle-live/useWithBank";
import { fmtNum } from "./bankUi";

export const BANK_LICENSE_KEY = ["bank-license"] as const;

const TIER_TONE: Record<LicenseTier["id"], string> = {
  small: "auction-rarity--common",
  medium: "auction-rarity--rare",
  large: "auction-rarity--legendary",
};

type Pick = { tier: LicenseTier["id"]; currency: LicenseCurrency; price: number };

/** 1 алмаз, 2 алмаза, 5 алмазов; en — diamond(s). */
function diamondsWord(n: number, ru: boolean): string {
  if (!ru) return n === 1 ? "diamond" : "diamonds";
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "алмазов";
  return b === 1 ? "алмаз" : b >= 2 && b <= 4 ? "алмаза" : "алмазов";
}

export function BankLicenses({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: BANK_LICENSE_KEY, queryFn: () => getBankLicense() });
  const [confirm, setConfirm] = useState<Pick | null>(null);
  const loc = ru ? "ru-RU" : "en-US";
  const compact = (n: number) =>
    n >= 1e6 ? `${(n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 })} ${ru ? "млн" : "M"}` : fmtNum(n, ru);
  const usd = (n: number) => `$${n.toLocaleString(loc, { maximumFractionDigits: 2 })}`;
  const gems = (n: number) => `${fmtNum(n, ru)} ${diamondsWord(n, ru)}`;
  const money = (p: Pick) =>
    p.currency === "USDT" ? `${usd(p.price)} USDT` : p.currency === "diamonds" ? gems(p.price) : `${fmtNum(p.price, ru)} DARAI`;
  const buy = useMutation({
    mutationFn: (p: Pick) =>
      buyBankLicense({ data: { tier: p.tier, currency: p.currency, expectPrice: p.price, opId: crypto.randomUUID() } }),
    onSuccess: () => toast.success(ru ? "Лицензия куплена" : "License bought"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      setConfirm(null);
      for (const key of [BANK_LICENSE_KEY, ACC_BALANCES_KEY, RESOURCES_KEY, CASTLE_BANK_KEY])
        void qc.invalidateQueries({ queryKey: key });
    },
  });

  const title = (
    <h2 id="bank-license-title" className="mb-3 font-['Auction_Russo'] text-lg text-[#fff0c7]">
      {ru ? "Лицензия на продажу золота" : "Gold selling license"}
    </h2>
  );
  // Ответ старой формы (до 17.10, из кэша на устройстве) — как загрузка, пока не перечитается.
  const stale = !!q.data && (typeof q.data.diamonds !== "number" || typeof q.data.prices?.small?.Darai !== "number");
  if (q.isPending || q.isError || stale) {
    return (
      <section className="auction-ledger" aria-labelledby="bank-license-title">
        {title}
        {q.isPending || stale ? (
          <p className="auction-loading" role="status">{ru ? "Загрузка…" : "Loading…"}</p>
        ) : (
          <p role="alert">{q.error instanceof Error ? q.error.message : String(q.error)}</p>
        )}
      </section>
    );
  }

  const d = q.data;
  // Статус — действующая лицензия (старшая из купленной и подписочной);
  // «продление / замена» — только про купленную.
  const cur = d.license;
  const bySub = !!cur && !!d.sub && cur.tier === d.sub.tier && cur.endsAt === d.sub.endsAt;
  const active = licenseActive(cur);
  const curTier = cur ? licenseTier(cur.tier) : undefined;
  const daysLeft = active ? Math.ceil((Date.parse(cur!.endsAt) - Date.now()) / 86_400_000) : 0;
  const until = cur ? new Date(cur.endsAt).toLocaleDateString(loc, { day: "numeric", month: "long" }) : "";

  return (
    <section className="auction-ledger" aria-labelledby="bank-license-title">
      {title}
      <div className={`mb-3 flex items-center gap-3 rounded-xl border p-3 ${active ? "border-[#3f8f63] bg-[#10261c]" : "border-[#ffffff1f] bg-[#0d1b2b]"}`}>
        {active ? <ShieldCheck className="h-7 w-7 shrink-0 text-[#8df0b6]" aria-hidden="true" /> : <ShieldOff className="h-7 w-7 shrink-0 text-[#8a8173]" aria-hidden="true" />}
        <div className="min-w-0">
          {active && curTier ? (
            <>
              <p className="flex flex-wrap items-center gap-2 font-bold text-[#fbeccb]">
                {ru ? curTier.ru : curTier.en}
                <span className="auction-chip auction-chip--live">{ru ? "действует" : "active"}</span>
                {bySub && <span className="auction-kind">{ru ? "по подписке" : "by subscription"}</span>}
              </p>
              <p className="auction-lot__meta">
                {ru ? "до" : "up to"} {fmtNum(cur!.dailyLimit, ru)} {ru ? "золота в сутки" : "gold a day"} · {ru ? "до" : "until"} {until} ({ru ? `ещё ${daysLeft} дн.` : `${daysLeft} d left`})
              </p>
            </>
          ) : (
            <p className="font-bold text-[#cdb791]">{ru ? "Лицензии нет" : "No license"}</p>
          )}
        </div>
      </div>

      <p className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#b9a885]">
        <span>{ru ? "На счёте" : "On account"}:</span>
        <b className="text-[#fff0c7]">{fmtNum(d.darai, ru)} DARAI</b>
        <b className="text-[#fff0c7]">{usd(d.usdt)} USDT</b>
        <b className="text-[#fff0c7]">{gems(d.diamonds)}</b>
      </p>
      {(d.buyback.pendingDarai > 0 || d.buyback.doneDarai > 0) && (
        <p className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#b9a885]">
          <span>{ru ? "Откуп золота" : "Gold buyback"}:</span>
          {d.buyback.pendingDarai > 0 && (
            <b className="text-[#ffd773]">{ru ? "ждёт пула" : "awaiting pool"} {compact(d.buyback.pendingDarai)} DARAI</b>
          )}
          {d.buyback.doneDarai > 0 && (
            <b className="text-[#fff0c7]">
              {ru ? "выкуплено" : "bought"} {fmtNum(d.buyback.goldOut, ru)} {ru ? "золота за" : "gold for"} {compact(d.buyback.doneDarai)} DARAI
            </b>
          )}
        </p>
      )}

      <ul>
        {LICENSE_TIERS.map((t) => {
          const price = d.prices[t.id];
          const kind = purchaseKind(d.paid, t.id);
          const asking = confirm?.tier === t.id ? confirm : null;
          return (
            <li key={t.id} className="auction-lot">
              <div className="auction-lot__top">
                <span className={`auction-lot__media ${TIER_TONE[t.id]}`} aria-hidden="true">
                  <ScrollText />
                </span>
                <div className="auction-lot__info">
                  <p className="auction-lot__title flex flex-wrap items-center gap-2">
                    {ru ? t.ru : t.en}
                    {kind !== "new" && (
                      <span className="auction-kind">
                        {kind === "extend" ? (ru ? "продление" : "extend") : ru ? "замена текущей" : "replaces current"}
                      </span>
                    )}
                  </p>
                  <p className="auction-lot__meta">
                    {ru ? "до" : "up to"} {fmtNum(t.dailyGold, ru)} {ru ? "золота в сутки" : "gold a day"} · {LICENSE_DAYS} {ru ? "дней" : "days"}
                  </p>
                </div>
              </div>
              {asking ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm text-[#fbeccb]">
                    {ru ? "Оплатить" : "Pay"} <b>{money(asking)}</b>?
                  </p>
                  <button type="button" className="auction-secondary" onClick={() => setConfirm(null)}>
                    {ru ? "Отмена" : "Cancel"}
                  </button>
                  <button type="button" className="auction-primary" disabled={buy.isPending} onClick={() => buy.mutate(asking)}>
                    {buy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {ru ? "Оплатить" : "Pay"}
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="auction-primary"
                    disabled={buy.isPending || d.darai < price.Darai}
                    onClick={() => setConfirm({ tier: t.id, currency: "Darai", price: price.Darai })}
                  >
                    {compact(price.Darai)} DARAI
                  </button>
                  <button
                    type="button"
                    className="auction-secondary"
                    disabled={buy.isPending || d.usdt < price.USDT}
                    onClick={() => setConfirm({ tier: t.id, currency: "USDT", price: price.USDT })}
                  >
                    {usd(price.USDT)} USDT
                  </button>
                  <button
                    type="button"
                    className="auction-secondary inline-flex items-center justify-center gap-1"
                    disabled={buy.isPending || d.diamonds < price.diamonds}
                    onClick={() => setConfirm({ tier: t.id, currency: "diamonds", price: price.diamonds })}
                  >
                    <img src="/resources/crystal.webp" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                    {gems(price.diamonds)}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
