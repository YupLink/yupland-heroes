import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getOperatingBalances,
  getServiceWallet,
} from "@/server/api/admin-users";
import { getSession } from "@/server/api/user-auth";
import { getConnector } from "@/lib/near-connector";
import { useT } from "@/lib/i18n";
import {
  Wallet,
  Copy,
  Check,
  Loader2,
  ArrowDown,
  Coins,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FT_TRANSFER_GAS = "30000000000000"; // 30 TGas
const STORAGE_DEPOSIT_GAS = "10000000000000";
const STORAGE_DEPOSIT_AMOUNT = "1250000000000000000000"; // 0.00125 NEAR

interface FunctionCallAction {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: object;
    gas: string;
    deposit: string;
  };
}

export function ServiceWalletPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  const wallet = useQuery({
    queryKey: ["admin", "service-wallet"],
    queryFn: () => getServiceWallet(),
  });

  const balances = useQuery({
    queryKey: ["admin", "operating-balances"],
    queryFn: () => getOperatingBalances(),
    refetchInterval: 60_000,
  });

  const accountId = wallet.data?.accountId ?? "—";
  // Top-up доступен ЛЮБОМУ админу. Если на подключённом кошельке нет
  // нужных токенов, ft_transfer просто упадёт с понятной ошибкой —
  // юзер сам решит, тем кошельком сейчас пополнять или другим.
  const canTopUp = !!session.data?.isAdmin && !!session.data?.wallet;
  const fromWallet = session.data?.wallet ?? "";

  const copy = () => {
    if (!wallet.data?.accountId) return;
    navigator.clipboard
      .writeText(wallet.data.accountId)
      .then(() => {
        setCopied(true);
        toast.success(t("header.copied"));
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error(t("svcwallet.copy_failed")));
  };

  // ── Top-up form (только для darai_collection.near) ────────────────────
  const [topUpToken, setTopUpToken] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");

  const send = useMutation({
    mutationFn: async (input: {
      symbol: string;
      ftContract: string;
      decimals: number;
      amount: number;
    }) => {
      const connector = await getConnector();
      if (!connector) throw new Error(t("svcwallet.near_not_connected"));
      // getConnectedWallet — берёт активную сессию (а не любой wallet с
      // диска). Если сессии нет — кидает; не открываем заново connect-модал.
      let w;
      try {
        const conn = await connector.getConnectedWallet();
        w = conn.wallet;
      } catch {
        throw new Error(t("svcwallet.near_session_inactive"));
      }

      const rawAmount = (
        BigInt(input.amount) *
        10n ** BigInt(input.decimals)
      ).toString();

      // Никаких pre-fetch проверок. Каждое await между user click и
      // signAndSendTransactions «съедает» user gesture context, и тогда
      // window.open в hot-connector блокируется → HOT-popup не открывает
      // TG. По NEP-145 storage_deposit идемпотентный: если кошелёк уже
      // зарегистрирован, прицеплённый депозит автоматически возвращается.
      // Поэтому всегда включаем оба action'а — потери 0.
      const actions: FunctionCallAction[] = [
        {
          type: "FunctionCall",
          params: {
            methodName: "storage_deposit",
            args: { account_id: accountId, registration_only: true },
            gas: STORAGE_DEPOSIT_GAS,
            deposit: STORAGE_DEPOSIT_AMOUNT,
          },
        },
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer",
            args: {
              receiver_id: accountId,
              amount: rawAmount,
              memo: "service wallet top-up",
            },
            gas: FT_TRANSFER_GAS,
            deposit: "1",
          },
        },
      ];

      await w.signAndSendTransactions({
        transactions: [
          {
            receiverId: input.ftContract,
            actions,
          },
        ],
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(
        t("svcwallet.sent_toast", { amount: vars.amount, symbol: vars.symbol })
      );
      setTopUpAmount("");
      qc.invalidateQueries({ queryKey: ["admin", "operating-balances"] });
    },
    onError: (e: Error) => {
      const msg = e.message;
      if (/cancel|reject|deny/i.test(msg)) {
        toast.error(t("svcwallet.cancelled_in_wallet"));
      } else {
        toast.error(t("svcwallet.error_prefix", { msg }));
      }
    },
  });

  const tokenRow =
    balances.data?.find((b) => b.symbol === topUpToken) ?? balances.data?.[0];
  const amountNum = Number(topUpAmount);
  const canSend =
    canTopUp &&
    !!tokenRow &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    !send.isPending;

  return (
    <section className="overflow-hidden rounded-3xl border border-gold/20 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10">
          <Wallet className="h-5 w-5 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("svcwallet.title")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-sm text-foreground">
              {accountId}
            </code>
            <button
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  {t("svcwallet.copy_ok")}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  {t("svcwallet.copy_btn")}
                </>
              )}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("svcwallet.gas_label")}{" "}
            <span className="text-foreground">
              {wallet.data?.nearBalance ?? "0"} NEAR
            </span>
          </div>
        </div>
      </div>

      {/* Балансы по токенам — свёрнуто по умолчанию */}
      {(() => {
        const list = balances.data ?? [];
        const withBalance = list.filter((b) => BigInt(b.raw) > 0n);
        return (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setBalancesOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs transition hover:bg-secondary/50"
            >
              <Coins className="h-3.5 w-3.5 text-gold" />
              <span className="font-medium text-foreground">
                {t("svcwallet.token_balances")}
              </span>
              {balances.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-muted-foreground">
                  ·{" "}
                  {t("svcwallet.balances_summary", {
                    withBalance: withBalance.length,
                    total: list.length,
                  })}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 text-muted-foreground transition",
                  balancesOpen && "rotate-180 text-gold"
                )}
              />
            </button>

            {balancesOpen && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {balances.isLoading ? (
                  <div className="col-span-full text-center text-xs text-muted-foreground">
                    <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" />
                    {t("svcwallet.loading_balances")}
                  </div>
                ) : (
                  list.map((b) => (
                    <div
                      key={b.symbol}
                      className={cn(
                        "rounded-xl border p-2 text-xs",
                        BigInt(b.raw) > 0n
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-secondary/30"
                      )}
                      title={
                        b.error
                          ? t("svcwallet.error_prefix", { msg: b.error })
                          : `${b.ftContract} · ${b.decimals} dec`
                      }
                    >
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Coins className="h-3 w-3" />
                        <span className="truncate">{b.symbol}</span>
                        {b.error && (
                          <AlertTriangle className="ml-auto h-3 w-3 text-destructive" />
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-display text-base font-bold text-foreground">
                        {b.human}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Top-up форма для darai_collection.near */}
      {canTopUp && (
        <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ArrowDown className="h-4 w-4 shrink-0 text-gold" />
            <span className="truncate">
              {t("svcwallet.top_up_from", { wallet: fromWallet })}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <select
              value={topUpToken || tokenRow?.symbol || ""}
              onChange={(e) => setTopUpToken(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
            >
              {(balances.data ?? []).map((b) => (
                <option key={b.symbol} value={b.symbol}>
                  {b.symbol} ({b.human})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="any"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder={t("svcwallet.amount_placeholder")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 sm:w-24"
            />
            <button
              onClick={() => {
                if (!tokenRow) return;
                send.mutate({
                  symbol: tokenRow.symbol,
                  ftContract: tokenRow.ftContract,
                  decimals: tokenRow.decimals,
                  amount: amountNum,
                });
              }}
              disabled={!canSend}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              {t("common.send")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
