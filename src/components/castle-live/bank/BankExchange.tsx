// Обмен в банке (открыт игрокам 20.10.2026): пул из наполненных, что отдаю, сколько. Предпросмотр
// считает та же формула, что база (lib/bankSwap): сколько получу, комиссия (игроку —
// только процент; внутри 80 % в пул, 20 % в пул карты), цена до и после. Продажа золота за DARAI — по лицензии с
// суточным лимитом; сервер откажет, если курс ушёл больше чем на 1 %. С 25.10.2026 пары —
// любые: монеты счёта (USDT, звёзды, HOPE…) берутся со счёта, график — у выбранной пары.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { listBankPools } from "@/server/api/bank/bank-pools";
import { getBankLicense } from "@/server/api/bank/bank-license";
import { swapBank } from "@/server/api/bank/bank-swap";
import { isBankResource, tokenIcon, tokenLabel, tokenLetters, type BankPool, type BankToken } from "@/lib/castleBank";
import { dpOf, floorTo, poolLive, quote } from "@/lib/bankSwap";
import { licenseActive } from "@/lib/bankLicense";
import { useResources } from "@/lib/hooks/useResources";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { BANK_LICENSE_KEY, BANK_POOLS_KEY, refreshBank } from "./bankKeys";
import { fmtNum } from "./bankUi";
import { useEntryRules } from "@/hooks/useEntryRules";
import { BankRateHistory } from "./BankRateHistory";
import { bankPoolForPair, bankSourceTokens, bankTargetTokens, preferredBankTarget } from "./bankPairOptions";

const isSellGold = (p: BankPool, t: BankToken) => p.tokenA === "gold" && p.tokenB === "Darai" && t === "gold";

export function BankExchange({ ru, onLicenseClick }: { ru: boolean; onLicenseClick?: () => void }) {
  const qc = useQueryClient();
  const pools = useQuery({ queryKey: BANK_POOLS_KEY, queryFn: () => listBankPools() });
  const lic = useQuery({ queryKey: BANK_LICENSE_KEY, queryFn: () => getBankLicense() });
  const res = useResources();
  const acc = useAccountBalances();
  // Пары со звёздами — только аккаунту с настоящим Telegram (§8.127).
  const stars = useEntryRules().stars;
  const live = (pools.data ?? []).filter((p) => poolLive(p) && (stars || (p.tokenA !== "STARS" && p.tokenB !== "STARS")));
  const [tokenIn, setTokenIn] = useState<BankToken | null>(null);
  const [tokenOut, setTokenOut] = useState<BankToken | null>(null);
  const [amount, setAmount] = useState("");
  const [openCurrency, setOpenCurrency] = useState<"source" | "target" | null>(null);
  const sourceTokens = bankSourceTokens(live);
  const selectedIn = tokenIn && sourceTokens.includes(tokenIn) ? tokenIn : live[0]?.tokenA;
  const targetTokens = selectedIn ? bankTargetTokens(live, selectedIn) : [];
  const selectedOut = preferredBankTarget(targetTokens, tokenOut);
  const selectedPool = selectedIn && selectedOut ? bankPoolForPair(live, selectedIn, selectedOut) : undefined;
  // A pool can disappear after refresh; never submit an old amount for a different pair.
  useEffect(() => { setAmount(""); setOpenCurrency(null); }, [selectedPool?.id]);
  const swap = useMutation({
    mutationFn: (v: { pool: BankPool; tokenIn: BankToken; amount: number; minOut: number }) =>
      swapBank({ data: { poolId: v.pool.id, tokenIn: v.tokenIn, amount: v.amount, minOut: v.minOut, opId: crypto.randomUUID() } }),
    onSuccess: (r, v) => {
      toast.success(`${ru ? "Получено" : "Received"} ${fmtNum(r.out, ru)} ${tokenLabel(v.tokenIn === v.pool.tokenA ? v.pool.tokenB : v.pool.tokenA, ru)}`);
      setAmount("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => void refreshBank(qc),
  });
  if (!selectedPool || !selectedIn || !selectedOut) return <section className="bank-player__panel" role="status">{pools.isPending ? (ru ? "Загрузка пулов…" : "Loading pools…") : pools.isError ? (pools.error instanceof Error ? pools.error.message : String(pools.error)) : (ru ? "Сейчас нет доступной пары для обмена" : "No exchange pair is available")}</section>;

  const pool = selectedPool;
  const inTok = selectedIn;
  const outTok = selectedOut;
  const value = Number(amount.replace(",", ".").trim());
  const q = Number.isFinite(value) && value > 0 ? quote(pool, inTok, value) : null;
  const coin = (t: BankToken) => {
    const rows = Array.isArray(acc.data?.balances) ? acc.data.balances : [];
    return rows.find((b) => b.token.toLowerCase() === t.toLowerCase())?.balance ?? 0;
  };
  const balance =
    inTok === "Darai"
      ? (lic.data?.darai ?? 0)
      : isBankResource(inTok)
        ? (res.data?.[inTok] ?? 0)
        : coin(inTok);
  const sell = isSellGold(pool, inTok);
  const license = lic.data?.license ?? null;
  // Золото с друзей (§8.101) меняется без лимита лицензии — неделю после начисления.
  const refLeft = sell ? (lic.data?.refGold ?? 0) : 0;
  const licLeft = sell && license && licenseActive(license) ? Math.max(0, license.dailyLimit - (lic.data?.soldGold24h ?? 0)) : null;
  const left = licLeft === null && !(refLeft > 0) ? null : (licLeft ?? 0) + refLeft;
  const blocked = sell && (left === null ? (ru ? "Нужна лицензия на продажу золота" : "A gold selling license is required") : value > left ? (ru ? "Больше суточного лимита лицензии" : "Over the license daily limit") : null);
  const short = value > balance;
  const price = (n: number) => `1 ${tokenLabel(pool.tokenA, ru)} = ${fmtNum(n, ru)} ${tokenLabel(pool.tokenB, ru)}`;

  const buttonText = swap.isPending ? (ru ? "Обмен…" : "Exchanging…")
    : blocked || (!q ? (ru ? "Введите сумму" : "Enter amount") : short ? (ru ? "Не хватает средств" : "Insufficient balance") : ru ? "Обменять" : "Exchange");

  const otherTokenArt: Record<string, string> = { wood: "/resources/wood.png", stone: "/resources/stone.png", diamonds: "/resources/crystal.png" };
  const moneyIcon = (token: BankToken) => token === "gold" || token === "Darai"
    ? <span className={`bank-player__money-icon bank-player__money-icon--${token === "gold" ? "gold" : "darai"}`} aria-hidden="true" />
    : otherTokenArt[token]
      ? <img className="bank-player__resource-icon" src={otherTokenArt[token]} alt="" aria-hidden="true" />
      : tokenIcon(token)
        ? <img className="bank-player__coin-icon" src={tokenIcon(token)!} alt="" aria-hidden="true" />
        : <span className="bank-player__coin-badge" aria-hidden="true">{tokenLetters(token)}</span>;
  const currencyPicker = (slot: "source" | "target", selected: BankToken) => <span className="bank-player__picker">
    <button className="bank-player__picker-button" type="button" aria-label={ru ? `Выбрать валюту ${slot === "source" ? "списания" : "получения"}` : `Choose ${slot === "source" ? "source" : "target"} currency`} aria-expanded={openCurrency === slot} onClick={() => setOpenCurrency(openCurrency === slot ? null : slot)}>
      {moneyIcon(selected)}<span>{tokenLabel(selected, ru)}</span><svg className="bank-player__chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {openCurrency === slot && <span className="bank-player__picker-options" role="group" aria-label={ru ? "Валюта обмена" : "Exchange currency"}>
      {(slot === "source" ? sourceTokens : targetTokens).map((token) => <button key={token} type="button" aria-current={token === selected ? "true" : undefined} onClick={() => {
        if (token === selected) { setOpenCurrency(null); return; }
        if (slot === "source") {
          const nextTargets = bankTargetTokens(live, token);
          setTokenIn(token);
          setTokenOut(preferredBankTarget(nextTargets, outTok));
        } else setTokenOut(token);
        setAmount("");
        setOpenCurrency(null);
      }}>{moneyIcon(token)}{tokenLabel(token, ru)}</button>)}
    </span>}
  </span>;

  return (
    <section className="bank-player__panel bank-player__exchange" aria-labelledby="bank-exchange-title">
      <h2 id="bank-exchange-title" className="bank-player__sr-only">{ru ? "Обмен" : "Exchange"}</h2>
      <label className="bank-player__field-label" htmlFor="bank-player-amount">{ru ? "Отдаю" : "Give"}</label>
      <div className="bank-player__field">
        {currencyPicker("source", inTok)}
        <input id="bank-player-amount" inputMode="decimal" placeholder={ru ? `В наличии: ${fmtNum(balance, ru)}` : `Available: ${fmtNum(balance, ru)}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" onClick={() => setAmount(String(floorTo(balance, dpOf(pool, inTok))))}>{ru ? "Макс" : "Max"}</button>
      </div>
      <div className="bank-player__flip"><button type="button" aria-label={ru ? "Поменять направление" : "Flip direction"} onClick={() => { setTokenIn(outTok); setTokenOut(inTok); setAmount(""); setOpenCurrency(null); }}><ArrowDownUp aria-hidden="true" /></button></div>
      <p className="bank-player__field-label">{ru ? "Получу" : "Receive"}</p>
      <div className="bank-player__field">
        {currencyPicker("target", outTok)}
        <output>{q ? fmtNum(q.out, ru) : "—"}</output>
      </div>
      <button type="button" className="bank-player__primary" disabled={!q || short || !!blocked || swap.isPending} onClick={() => q && swap.mutate({ pool, tokenIn: inTok, amount: value, minOut: floorTo(q.out * 0.99, dpOf(pool, outTok)) })}>
        {swap.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{buttonText}
      </button>
      {sell && <div className="bank-player__license-notice">
        <svg viewBox="0 0 36 42" aria-hidden="true"><path d="M18 2 32 7v13c0 9-6 16-14 20C10 36 4 29 4 20V7Z" fill="#9b621b" stroke="#e8ba59" strokeWidth="2"/><path d="M18 5 29 9v11c0 7-4 12-11 16C11 32 7 27 7 20V9Z" fill="#e7ad43" stroke="#492a12" strokeWidth="1.5"/><path d="m10 15 4 3 4-6 4 6 4-3-1 10H11Z" fill="#32200d"/><path d="M11 26h14" stroke="#32200d" strokeWidth="2"/></svg>
        <p>{left === null ? (ru ? "Для продажи золота нужна лицензия" : "A license is required to sell gold") : `${ru ? "Лимит продажи сегодня" : "Remaining daily limit"}: ${fmtNum(left, ru)} ${ru ? "золота" : "gold"}`}</p>
        {onLicenseClick && <button type="button" onClick={onLicenseClick}>{ru ? "К лицензии" : "License"} ›</button>}
      </div>}
      {short && q && <p className="bank-player__error" role="alert">{ru ? "Не хватает средств на счёте" : "Insufficient balance"}</p>}
      <BankRateHistory ru={ru} poolId={pool.id} />
      <dl className="bank-player__quote">
        <dt>{ru ? "Комиссия" : "Fee"}</dt><dd>{pool.feePct} %</dd>
        <dt>{ru ? "Курс до обмена" : "Rate before"}</dt><dd>{q ? price(q.priceBefore) : "—"}</dd>
        <dt>{ru ? "Курс после обмена" : "Rate after"}</dt><dd>{q ? price(q.priceAfter) : "—"}</dd>
        <dt>{ru ? "Влияние на цену" : "Price impact"}</dt><dd>{q ? `${fmtNum(Math.round(q.impactPct * 100) / 100, ru)} %` : "—"}</dd>
      </dl>
    </section>
  );
}
