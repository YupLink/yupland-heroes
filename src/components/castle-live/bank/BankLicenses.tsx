// The player chooses a tier first, then sees its price and payment method.
// Purchase still uses the existing server API and explicit confirmation.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { buyBankLicense, getBankLicense } from "@/server/api/bank/bank-license";
import {
  LICENSE_CURRENCIES, LICENSE_DAYS, LICENSE_TIERS, licenseActive, licenseTier, purchaseKind,
  type LicenseCurrency, type LicenseTier,
} from "@/lib/bankLicense";
import { fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY, refreshBank } from "./bankKeys";
import { useEntryRules } from "@/hooks/useEntryRules";

export { BANK_LICENSE_KEY };

type Pick = { tier: LicenseTier["id"]; currency: LicenseCurrency; price: number };
const tierArt: Record<LicenseTier["id"], string> = {
  small: "/resources/bank/license-small.webp",
  medium: "/resources/bank/license-medium.webp",
  large: "/resources/bank/license-large.webp",
};

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
  const stars = useEntryRules().stars; // §8.127: звёзды — только с Telegram
  const [tierId, setTierId] = useState<LicenseTier["id"] | null>(null);
  const [currency, setCurrency] = useState<LicenseCurrency>("Darai");
  const [confirm, setConfirm] = useState<Pick | null>(null);
  const loc = ru ? "ru-RU" : "en-US";
  const usd = (n: number) => `$${n.toLocaleString(loc, { maximumFractionDigits: 2 })}`;
  const money = (p: Pick) => p.currency === "USDT"
    ? `${usd(p.price)} USDT`
    : p.currency === "STARS"
      ? `${fmtNum(p.price, ru)} ⭐`
      : p.currency === "diamonds"
        ? `${fmtNum(p.price, ru)} ${diamondsWord(p.price, ru)}`
        : `${fmtNum(p.price, ru)} DARAI`;
  const buy = useMutation({
    mutationFn: (p: Pick) => buyBankLicense({ data: { tier: p.tier, currency: p.currency, expectPrice: p.price, opId: crypto.randomUUID() } }),
    onSuccess: () => toast.success(ru ? "Лицензия куплена" : "License bought"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => { setConfirm(null); void refreshBank(qc); },
  });

  const title = <h2 id="bank-license-title">{ru ? "Лицензия на продажу золота" : "Gold selling license"}</h2>;
  const stale = !!q.data && (typeof q.data.diamonds !== "number" || typeof q.data.prices?.small?.Darai !== "number");
  if (q.isPending || q.isError || stale) return <section className="bank-player__panel bank-player__licenses" aria-labelledby="bank-license-title">
    {title}
    {q.isPending || stale ? <p role="status">{ru ? "Загрузка…" : "Loading…"}</p> : <p role="alert">{q.error instanceof Error ? q.error.message : String(q.error)}</p>}
  </section>;

  const d = q.data;
  const cur = d.license;
  const active = licenseActive(cur);
  // Сложенная лицензия (владелец 30.10): «Малая + Средняя · 30 000 золота в сутки».
  const kinds = (cur?.kinds ?? (cur ? [cur.tier] : [])).map((k) => licenseTier(k)).filter((t) => !!t);
  const bySub = !!cur && !d.paid.some((l) => licenseActive(l));
  const selected = tierId ? LICENSE_TIERS.find((t) => t.id === tierId) : null;
  // Звёзды без курса — цены нет (null): такую оплату не показываем.
  const price = (selected ? d.prices[selected.id][currency] : 0) ?? 0;
  const balance = currency === "Darai" ? d.darai : currency === "USDT" ? d.usdt
    : currency === "diamonds" ? d.diamonds : d.stars;
  const affordable = selected !== null && price > 0 && balance >= price;
  const kind = selected ? purchaseKind(d.paid, selected.id) : "new";
  const balanceText = currency === "Darai" ? `${fmtNum(balance, ru)} DARAI`
    : currency === "USDT" ? `${usd(balance)} USDT`
      : currency === "diamonds" ? `${fmtNum(balance, ru)} ${diamondsWord(balance, ru)}`
        : `${fmtNum(balance, ru)} ⭐`;

  return <section className="bank-player__panel bank-player__licenses" aria-labelledby="bank-license-title">
    {title}
    <p className="bank-player__license-status">
      {active && kinds.length
        ? `${ru ? "Действует" : "Active"}: ${kinds.map((t) => (ru ? t!.ru : t!.en)).join(" + ")} · ${kinds.length > 1
          ? `${fmtNum(cur!.dailyLimit, ru)} ${ru ? "золота в сутки" : "gold per day"}`
          : `${ru ? "до" : "until"} ${new Date(cur!.endsAt).toLocaleDateString(loc, { day: "numeric", month: "long" })}`}${bySub ? (ru ? " · по подписке" : " · by subscription") : ""}`
        : ru ? "Лицензии пока нет" : "No active license"}
    </p>
    <div className="bank-player__license-list-head">
      <h3>{ru ? "Выбери лимит" : "Choose a limit"}</h3>
      <p><small>{ru ? "В наличии" : "Available"}</small><strong>{balanceText}</strong></p>
    </div>
    <div className="bank-player__tier-list">
      {LICENSE_TIERS.map((t) => <button key={t.id} type="button" aria-pressed={tierId === t.id} onClick={() => { setTierId(t.id); setCurrency("Darai"); setConfirm(null); }}>
        <img src={tierArt[t.id]} alt="" aria-hidden="true" />
        <span className="bank-player__tier-name">{ru ? t.ru : t.en}</span>
        <span className="bank-player__tier-limit">{fmtNum(t.dailyGold, ru)} <small>/ {ru ? "сутки" : "day"}</small></span>
        <span className="bank-player__tier-check" aria-hidden="true">{tierId === t.id ? "✓" : ""}</span>
      </button>)}
    </div>
    {selected && <div className="bank-player__license-purchase">
      <h3>{ru ? `Покупка: ${selected.ru}` : `Purchase: ${selected.en}`}</h3>
      <p>{ru ? `На ${LICENSE_DAYS} дней · до ${fmtNum(selected.dailyGold, ru)} золота в сутки` : `For ${LICENSE_DAYS} days · up to ${fmtNum(selected.dailyGold, ru)} gold per day`}</p>
      {kind === "extend" && <p>{ru ? "Продление текущей лицензии" : "Extends current license"}</p>}
      <div className="bank-player__payment-list" role="group" aria-label={ru ? "Способ оплаты" : "Payment method"}>
        {LICENSE_CURRENCIES.map((c) => {
          const cost = d.prices[selected.id][c];
          if (cost == null || (c === "STARS" && !stars)) return null;
          return <button key={c} type="button" aria-pressed={currency === c} onClick={() => { setCurrency(c); setConfirm(null); }}>
            <span>{c === "Darai" ? "DARAI" : c === "USDT" ? "USDT" : c === "diamonds" ? (ru ? "Алмазы" : "Diamonds") : ru ? "Звёзды" : "Stars"}</span>
            <b>{money({ tier: selected.id, currency: c, price: cost })}</b>
            <i aria-hidden="true">{currency === c ? "✓" : ""}</i>
          </button>;
        })}
      </div>
      {!affordable && <p className="bank-player__error" role="alert">{ru ? "Недостаточно средств на счёте" : "Insufficient balance"}</p>}
      {confirm ? <div className="bank-player__license-confirm" role="alertdialog" aria-label={ru ? "Подтверждение покупки лицензии" : "Confirm license purchase"}>
        <p>{ru ? "Оплатить" : "Pay"} <strong>{money(confirm)}</strong>?</p>
        <div><button type="button" onClick={() => setConfirm(null)}>{ru ? "Отмена" : "Cancel"}</button><button type="button" disabled={buy.isPending} onClick={() => buy.mutate(confirm)}>{buy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ru ? "Подтвердить" : "Confirm"}</button></div>
      </div> : <button type="button" className="bank-player__primary" disabled={!affordable || buy.isPending} onClick={() => setConfirm({ tier: selected.id, currency, price })}>{ru ? "Купить лицензию" : "Buy license"}</button>}
      <small className="bank-player__license-footnote">{ru ? "По одной лицензии каждого вида — лимиты складываются; та же ступень продлит срок." : "One license of each tier — limits stack; the same tier extends it."}</small>
    </div>}
    {(d.buyback.pendingDarai > 0 || d.buyback.doneDarai > 0) && <p className="bank-player__buyback">
      {ru ? "Откуп золота" : "Gold buyback"}: {d.buyback.pendingDarai > 0 && `${ru ? "ждёт пула" : "awaiting pool"} ${fmtNum(d.buyback.pendingDarai, ru)} DARAI`}
      {d.buyback.doneDarai > 0 && ` · ${ru ? "выкуплено" : "bought"} ${fmtNum(d.buyback.goldOut, ru)} ${ru ? "золота за" : "gold for"} ${fmtNum(d.buyback.doneDarai, ru)} DARAI`}
    </p>}
  </section>;
}
