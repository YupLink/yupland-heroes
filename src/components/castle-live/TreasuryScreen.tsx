import { useEffect, useState, type Ref } from "react";
import { isWalletLinked } from "@/lib/walletLinked";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Star, Wallet } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { getAccountDepositInfo } from "@/server/api/currency/deposit";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { isCastleToken } from "@/lib/castleTokenScope";
import { coinIcon } from "@/lib/coinIcon";
import { AccountModal } from "@/components/account/AccountModal";
import { AccountTopUp } from "@/components/account/AccountTopUp";
import { AccountWithdraw } from "@/components/account/AccountWithdraw";
import { AccountHistory } from "@/components/account/AccountHistory";
import { StarsTopUp } from "@/components/account/StarsTopUp";
import { TreasuryWalletConnection } from "./TreasuryWalletConnection";
import { TreasuryPortalConnection } from "./TreasuryPortalConnection";
import { TreasurySolanaConnection } from "./TreasurySolanaConnection";
import { TreasuryEthConnection } from "./TreasuryEthConnection";
import { useWalletLinks } from "./useWalletLinks";
import { useEntryRules } from "@/hooks/useEntryRules";
import { TreasuryDebt } from "./TreasuryDebt";
import vaultRoom from "@/assets/treasury/vault-room.webp";
import "./castle-profile.css";
import "./treasury-screen.css";

type Selection = { symbol: string; mode: "choices" | "top-up" | "withdraw" };

export function TreasuryScreen({
  onBack,
  backRef,
  walletStatus,
  walletName,
  onPreviewWalletChange,
  openWalletConnection = false,
}: {
  onBack: () => void;
  backRef?: Ref<HTMLButtonElement>;
  walletStatus?: "connected" | "disconnected";
  walletName?: string;
  onPreviewWalletChange?: (connected: boolean, name?: string) => void;
  openWalletConnection?: boolean;
}) {
  const ru = useLang() === "ru";
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const accountOpen = session.data?.accountOpen === true;
  const info = useQuery({
    queryKey: ["acc-deposit-info", "v2", session.data?.wallet ?? ""],
    queryFn: () => getAccountDepositInfo(),
    enabled: accountOpen && !!session.data?.wallet,
    staleTime: 5 * 60_000,
  });
  const balances = useAccountBalances();
  // Звёзды — только с настоящим Telegram; вывод — только белому списку (§8.127).
  const rules = useEntryRules();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // Вход только через Telegram (tg<id>) — не кошелёк: звездочник видит звёзды и
  // добытые монеты без пополнения и вывода (владелец, 07.10.2026).
  const connected = walletStatus ? walletStatus === "connected" : isWalletLinked(session.data?.wallet);
  const wallet = session.data?.wallet ?? null;
  // Подключать кошелёк — только тем, у кого он уже есть (владелец, 09.11.2026).
  const links = useWalletLinks(connected);
  useEffect(() => setSelection(null), [wallet, connected]);
  const tokens = (info.data?.tokens ?? []).filter((token) => isCastleToken(token.symbol));
  const stars = tokens.find((token) => token.stars);
  const amounts = new Map(
    (balances.data?.balances ?? []).map((item) => [item.token.toLowerCase(), item.balance]),
  );
  const amountOf = (symbol: string) => amounts.get(symbol.toLowerCase()) ?? 0;
  const currencies = tokens
    .filter((token) => !token.stars)
    .sort((a, b) => amountOf(b.symbol) - amountOf(a.symbol) || a.symbol.localeCompare(b.symbol));
  // «Только Google» (владелец, 13.11.2026): DarAi видно всегда, хоть 0; остальное — когда появится.
  const alwaysShown = (symbol: string) => rules.googleOnly && symbol.toLowerCase() === "darai";
  const visibleCurrencies = connected ? currencies : currencies.filter((token) => amountOf(token.symbol) > 0 || alwaysShown(token.symbol));
  const hasEarnedCoins = visibleCurrencies.length > 0;
  const showCurrencies = connected || (accountOpen && !!wallet && (info.isPending || balances.isPending || hasEarnedCoins));
  const selectedToken = tokens.find((token) => token.symbol === selection?.symbol);
  const format = (value: number) => value.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 8 });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest('[role="dialog"]')) || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      if (selection) setSelection(null);
      else onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack, selection]);

  return (
    <div className="treasury-screen" lang={ru ? "ru" : "en"} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 16)}>
      <div className="treasury-stage">
        <header className={`treasury-header${scrolled ? " treasury-header--scrolled" : ""}`}>
          <button ref={backRef} type="button" className="treasury-back" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />{ru ? "Замок" : "Castle"}
          </button>
          <h1 id="castle-window-title">{ru ? "Казна" : "Treasury"}</h1>
        </header>
        <div className="treasury-scene" aria-hidden="true">
          <img src={vaultRoom} alt="" />
        </div>

        <section className="treasury-ledger" aria-label={ru ? "Счёт казны" : "Treasury account"}>
          <TreasuryDebt />
          {rules.stars && <div className="treasury-stars">
            <span className="treasury-stars__icon" aria-hidden="true"><Star /></span>
            <div className="treasury-stars__balance">
              <h2>Telegram Stars</h2>
              {session.isPending || (accountOpen && wallet && (info.isPending || balances.isPending)) ? (
                <span role="status">…</span>
              ) : accountOpen && !balances.isError && stars ? (
                <strong>{format(amountOf(stars.symbol))}</strong>
              ) : (
                <span>{ru ? "Недоступно" : "Unavailable"}</span>
              )}
            </div>
            <button
              type="button"
              data-game-button="primary"
              className="treasury-stars__top-up"
              disabled={!accountOpen || !wallet || !stars?.allowed || balances.isError}
              onClick={() => stars && setSelection({ symbol: stars.symbol, mode: "top-up" })}
            >{ru ? "Пополнить" : "Top up"}</button>
          </div>}

          {rules.stars && stars && !stars.allowed && <p className="treasury-state" role="status">{ru ? "Пополнение звёзд сейчас недоступно." : "Stars top-up is unavailable right now."}</p>}

          {session.isError && <p className="treasury-state" role="alert">{ru ? "Не удалось загрузить Казну." : "Could not load Treasury."} <button type="button" onClick={() => void session.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>}
          {accountOpen && (info.isError || balances.isError) && <p className="treasury-state" role="alert">{ru ? "Баланс временно недоступен." : "Balance is unavailable."} <button type="button" onClick={() => { void info.refetch(); void balances.refetch(); }}>{ru ? "Повторить" : "Retry"}</button></p>}

          {showCurrencies && <section className="treasury-currencies" aria-labelledby="treasury-currencies-title">
              <div className="treasury-currencies__heading">
                <h2 id="treasury-currencies-title">{connected ? (ru ? "Монеты на счёте" : "Account currencies") : (ru ? "Монеты в Казне" : "Coins in Treasury")}</h2>
                {connected && <span className="treasury-wallet-name"><Wallet aria-hidden="true" />{!ru && walletName === "Кошелёк YupLink" ? "YupLink Wallet" : walletName || (ru ? "Кошелёк" : "Wallet")}</span>}
              </div>
              {!accountOpen || !wallet ? <p className="treasury-state">{ru ? "Счёт валют пока недоступен." : "Currency account is unavailable."}</p> : info.isError || balances.isError ? null : info.isPending || balances.isPending ? <p className="treasury-state" role="status">{ru ? "Загрузка монет…" : "Loading currencies…"}</p> : visibleCurrencies.length ? (
                <ul className="treasury-currencies__list">
                  {visibleCurrencies.map((token) => {
                    const coin = <>
                        <span className="treasury-currency__icon" aria-hidden="true">{coinIcon(token.symbol) ? <img src={coinIcon(token.symbol)!} alt="" /> : token.symbol.slice(0, 2).toUpperCase()}</span>
                        <span className="treasury-currency__symbol">{token.symbol}</span>
                        <strong className={amountOf(token.symbol) ? "" : "treasury-currency__empty"}>{format(amountOf(token.symbol))}</strong>
                        {connected && <ChevronRight aria-hidden="true" />}
                    </>;
                    return <li key={token.symbol}>
                      {connected ? <button type="button" className="treasury-currency" onClick={() => setSelection({ symbol: token.symbol, mode: "choices" })}>{coin}</button>
                        : <div className="treasury-currency treasury-currency--balance">{coin}</div>}
                    </li>;
                  })}
                </ul>
              ) : connected ? <p className="treasury-state">{ru ? "Монет на счёте пока нет." : "No currencies on this account yet."}</p> : null}
            </section>}

          {accountOpen && <details className="treasury-history">
            <summary><span>{ru ? "История операций" : "Transaction history"}</span><ChevronRight aria-hidden="true" /></summary>
            <div className="treasury-history__body"><AccountHistory castleScope /></div>
          </details>}

          {links.ready && links.any && <section className="treasury-connections" aria-labelledby="treasury-connections-title">
            <h2 id="treasury-connections-title">{ru ? "Подключения" : "Connections"}</h2>
            {!connected && <p className="treasury-connections__hint">{hasEarnedCoins
              ? (ru ? "Монеты из рейда уже хранятся в Казне. Подключи кошелёк, чтобы оплачивать ими покупки или вывести их." : "Coins found in raids are already in Treasury. Connect a wallet to pay for purchases with them or withdraw them.")
              : (ru ? "Подключи кошелёк, чтобы пополнять Казну и использовать другие валюты." : "Connect a wallet to add and use other currencies in Treasury.")}</p>}
            <TreasuryWalletConnection wallet={wallet} status={connected ? "connected" : "disconnected"} onPreviewWalletChange={onPreviewWalletChange} openOnMount={openWalletConnection && !connected} />
            <TreasurySolanaConnection />
            <TreasuryEthConnection />
            <TreasuryPortalConnection walletConnected={connected} />
          </section>}
        </section>
      </div>

      {selection && selectedToken && (
        <AccountModal
          title={selection.symbol === "STARS" ? (ru ? "Пополнить звёздами" : "Top up Stars") : selection.symbol}
          onClose={() => setSelection(null)}
        >
          {selection.mode === "choices" ? (
            <div className="treasury-coin-actions">
              <p>{ru ? "На счёте" : "On account"}: {format(amountOf(selection.symbol))} {selection.symbol}</p>
              <button type="button" data-game-button="primary" disabled={!selectedToken.allowed || !info.data?.receiverId} onClick={() => setSelection({ ...selection, mode: "top-up" })}>{ru ? "Пополнить" : "Top up"}</button>
              {rules.canWithdraw && <button type="button" data-game-button="secondary" disabled={amountOf(selection.symbol) < selectedToken.minWithdraw || !info.data?.wallets?.length} onClick={() => setSelection({ ...selection, mode: "withdraw" })}>{ru ? "Вывести" : "Withdraw"}</button>}
              {!selectedToken.allowed && <p className="text-xs text-muted-foreground">{ru ? "Пополнение этой валюты сейчас недоступно." : "Top up is unavailable for this currency."}</p>}
              {selectedToken.allowed && !info.data?.receiverId && <p className="text-xs text-muted-foreground">{ru ? "Адрес для пополнения пока недоступен." : "The deposit address is unavailable."}</p>}
              {rules.canWithdraw && amountOf(selection.symbol) < selectedToken.minWithdraw && <p className="text-xs text-muted-foreground">{ru ? `Для вывода нужно минимум ${format(selectedToken.minWithdraw)} ${selection.symbol}.` : `Withdraw at least ${format(selectedToken.minWithdraw)} ${selection.symbol}.`}</p>}
              {rules.canWithdraw && !info.data?.wallets?.length && <p className="text-xs text-muted-foreground">{ru ? "Нет доступного кошелька для вывода." : "No wallet is available for withdrawal."}</p>}
            </div>
          ) : selection.mode === "withdraw" && rules.canWithdraw ? (
            <AccountWithdraw tokens={tokens} wallets={info.data?.wallets} symbol={selection.symbol} />
          ) : selection.symbol === "STARS" ? (
            <StarsTopUp />
          ) : (
            <AccountTopUp tokens={tokens} receiverId={info.data?.receiverId ?? ""} symbol={selection.symbol} />
          )}
        </AccountModal>
      )}
    </div>
  );
}
