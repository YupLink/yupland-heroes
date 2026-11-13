// YupLink Wallet · Sign Transaction.
// Публичный URL для подписи произвольной NEAR-транзакции от dApp'a.
// MNW-совместимый интерфейс.
//
// Поток (redirect-based):
//   1. dApp открывает /wallet/sign?
//        transactions=<base64-json>     // массив { signerId, receiverId, actions[] }
//       &callbackUrl=https://dapp/back
//       &meta=...                       // опц., прокидываем обратно
//   2. Мы парсим, показываем человекочитаемый breakdown
//   3. Юзер выбирает свой embedded-кошелёк + PIN
//   4. Подписываем + broadcast каждую tx
//   5. Редирект на callbackUrl?transactionHashes=h1,h2&meta=...
//
// На отказ/ошибку → callbackUrl?errorCode=userRejected&errorMessage=...
//
// Формат transactions[] (JSON):
//   [{
//     signerId: "alice.near",
//     receiverId: "v2.ref-finance.near",
//     actions: [
//       { type: "FunctionCall", params: { methodName, args, gas, deposit } },
//       { type: "Transfer",     params: { deposit } }
//     ]
//   }]

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  Check,
  X,
  FileSignature,
  Lock,
  Wallet as WalletIcon,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listLocalWallets, signAndSendTx, getBlobKind } from "@/lib/embeddedWallet";
import { hasAppPassword, isAppUnlocked, unlockApp } from "@/lib/appLock";
import { transferAction, functionCallAction } from "@/lib/nearTx";
import { touchDappConnection } from "@/server/api/walletConnect";
import { useT } from "@/lib/i18n";
import { returnUrlOrThrow, safeReturnUrl } from "@/lib/walletReturnUrl";

export const Route = createFileRoute("/wallet/sign")({
  head: () => ({
    meta: [
      { title: "Подпись транзакции — YupLink Wallet" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WalletSignPage,
});

interface TxAction {
  type: "FunctionCall" | "Transfer";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
}

interface TxRequest {
  signerId: string;
  receiverId: string;
  actions: TxAction[];
}

interface ParsedRequest {
  txs: TxRequest[];
  callbackUrl: string;
  meta: string | null;
}

function decodeBase64Json<T>(s: string): T {
  // url-safe base64 → стандартный
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  let str = "";
  // bin это latin-1 bytes; конвертим как utf-8
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  str = new TextDecoder().decode(bytes);
  return JSON.parse(str) as T;
}

function parseQuery(): ParsedRequest | { error: string } {
  if (typeof window === "undefined") return { error: "no-window" };
  const q = new URLSearchParams(window.location.search);
  const txParam = q.get("transactions") || q.get("transaction") || q.get("tx") || "";
  const callbackUrl = q.get("callbackUrl") || q.get("callback_url") || "";
  const meta = q.get("meta");
  if (!txParam) return { error: "transactions параметр обязателен" };
  if (!callbackUrl) return { error: "callbackUrl обязателен" };
  // Только https (и http на localhost): «javascript:» выполнил бы чужой код у нас.
  if (!safeReturnUrl(callbackUrl)) return { error: "callbackUrl должен быть https-адресом" };
  let parsed: unknown;
  try {
    parsed = decodeBase64Json<unknown>(txParam);
  } catch {
    return { error: "transactions: не удалось распарсить base64-JSON" };
  }
  const txs = Array.isArray(parsed) ? (parsed as TxRequest[]) : [parsed as TxRequest];
  if (txs.length === 0) return { error: "пустой массив транзакций" };
  for (const t of txs) {
    if (!t.signerId || !t.receiverId || !Array.isArray(t.actions)) {
      return { error: "tx должен содержать signerId, receiverId, actions[]" };
    }
  }
  return { txs, callbackUrl, meta };
}

function buildAction(a: TxAction) {
  if (a.type === "Transfer") {
    return transferAction(BigInt(a.params.deposit ?? "0"));
  }
  if (a.type === "FunctionCall") {
    return functionCallAction({
      methodName: a.params.methodName,
      args: a.params.args ?? {},
      gas: BigInt(a.params.gas ?? "30000000000000"),
      deposit: BigInt(a.params.deposit ?? "0"),
    });
  }
  throw new Error(`Unsupported action: ${a.type}`);
}

function yoctoToNear(y: string | bigint): string {
  try {
    const big = typeof y === "bigint" ? y : BigInt(y);
    if (big === 0n) return "0";
    const num = Number(big) / 1e24;
    // Пыль (напр. технический 1 yocto для NEP-171 nft_transfer) — без «1.00e-24».
    if (num < 0.0001) return "<0.0001";
    return num.toFixed(num < 1 ? 4 : 3);
  } catch {
    return String(y);
  }
}

// Человекочитаемые пары [token_id → receiver_id] для NFT-переводов.
// Одиночный nft_transfer: { token_id, receiver_id }.
// Mintbase nft_batch_transfer: { token_ids: [[token_id, receiver_id], ...] }.
function nftTransferPairs(methodName: string, rawArgs: unknown): Array<[string, string]> {
  if (methodName !== "nft_transfer" && methodName !== "nft_batch_transfer") return [];
  let args: Record<string, unknown> = {};
  try {
    args =
      typeof rawArgs === "string"
        ? JSON.parse(rawArgs)
        : ((rawArgs as Record<string, unknown>) ?? {});
  } catch {
    return [];
  }
  const out: Array<[string, string]> = [];
  const list = args.token_ids;
  if (Array.isArray(list)) {
    for (const p of list) {
      if (Array.isArray(p)) out.push([String(p[0]), String(p[1] ?? "?")]);
    }
  } else if (args.token_id != null) {
    out.push([String(args.token_id), String(args.receiver_id ?? "?")]);
  }
  return out;
}

function ActionPreview({ a }: { a: TxAction }) {
  const t = useT();
  if (a.type === "Transfer") {
    const near = yoctoToNear(a.params.deposit ?? "0");
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
        <div className="font-semibold text-gold">Transfer</div>
        <div className="mt-0.5 text-muted-foreground">
          {t("wsign.amount")} <span className="font-mono text-foreground">{near} NEAR</span>
        </div>
      </div>
    );
  }
  if (a.type === "FunctionCall") {
    const dep = a.params.deposit ?? "0";
    // NFT-перевод — показываем ЧТО и КОМУ, а не свёрнутый JSON.
    const nfts = nftTransferPairs(a.params.methodName, a.params.args);
    if (nfts.length > 0) {
      return (
        <div className="rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
          <div className="font-semibold text-gold">
            {t("wsign.nft_transfer_n", { n: nfts.length })}
          </div>
          <div className="mt-1.5 space-y-1">
            {nfts.map(([tid, rid], i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground">#{tid}</span>
                <span className="text-muted-foreground">→</span>
                <span className="truncate font-mono text-foreground">{rid}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    const argsStr = (() => {
      try {
        return JSON.stringify(a.params.args ?? {}, null, 2);
      } catch {
        return String(a.params.args);
      }
    })();
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
        <div className="font-semibold text-gold">
          FunctionCall · <span className="font-mono">{a.params.methodName}</span>
        </div>
        <div className="mt-1 text-muted-foreground">
          Deposit: <span className="font-mono text-foreground">{yoctoToNear(dep)} NEAR</span>
        </div>
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            args
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-1.5 text-[10px] leading-relaxed">
            {argsStr}
          </pre>
        </details>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
      {t("wsign.unsupported_action", { type: String((a as TxAction).type) })}
    </div>
  );
}

function WalletSignPage() {
  const t = useT();
  const [request, setRequest] = useState<ParsedRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [pin, setPin] = useState("");
  // PIN нужен ТОЛЬКО для зашифрованных (legacy) кошельков. Новые secure-кошельки
  // подписывают неизвлекаемым ключом без PIN — для них поле скрыто.
  const [pinNeeded, setPinNeeded] = useState(false);
  // Пароль кошелька (app-lock): если установлен и заблокирован — подпись dApp
  // требует разблокировки. Внутри открытого окна (авто-лок) повторно не спросит.
  const [appPwd, setAppPwd] = useState("");
  const [appLockNeeded, setAppLockNeeded] = useState(false);

  useEffect(() => {
    const r = parseQuery();
    if ("error" in r) setParseError(r.error);
    else setRequest(r);
    setAppLockNeeded(hasAppPassword() && !isAppUnlocked());
  }, []);

  // Живой пересчёт: если авто-лок сработал пока юзер читает транзакцию —
  // показать поле пароля, а не оставить тупик (кнопка активна, ввода нет).
  useEffect(() => {
    const id = setInterval(() => {
      setAppLockNeeded(hasAppPassword() && !isAppUnlocked());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await listLocalWallets();
        setWallets(list);
        if (list.length > 0) {
          // если все signerId одинаковые и совпадают с локальным — выберем
          const requested = request?.txs[0]?.signerId;
          const pre = requested && list.includes(requested) ? requested : list[0];
          setSelectedWallet(pre);
        }
      } catch {
        setWallets([]);
      }
    })();
  }, [request]);

  // Нужен ли PIN для выбранного кошелька: getBlobKind == null/"plain" → нет
  // (secure-кош или незашифрованный); per-account-pin/master-pin → да.
  useEffect(() => {
    if (!selectedWallet) {
      setPinNeeded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const kind = await getBlobKind(selectedWallet);
        if (!cancelled) {
          setPinNeeded(kind === "per-account-pin" || kind === "master-pin");
        }
      } catch {
        if (!cancelled) setPinNeeded(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWallet]);

  const approve = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error(t("wsign.err_no_request"));
      if (!selectedWallet) throw new Error(t("wsign.err_pick_wallet"));
      if (pinNeeded && !pin.trim()) throw new Error(t("wsign.enter_pin"));
      // Разблокировка app-lock перед подписью (если установлен и заблокирован).
      if (hasAppPassword() && !isAppUnlocked()) {
        if (!appPwd.trim()) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd); // throws "Неверный пароль"
      }
      const hashes: string[] = [];
      for (const tx of request.txs) {
        // signerId в запросе мог отличаться — мы подписываем выбранным
        // (юзер может явно выбрать другой свой кошелёк)
        const actions = tx.actions.map(buildAction);
        const r = await signAndSendTx({
          accountId: selectedWallet,
          pin: pinNeeded ? pin : undefined,
          receiverId: tx.receiverId,
          actions,
        });
        hashes.push(r.txHash);
      }
      // помечаем все FCAK у этого кошелька как использованные (если есть)
      try {
        // public_key подписания — это публичный ключ embedded-кошелька
        // (full-access). Это НЕ ключ dApp'а, поэтому touchDappConnection
        // вызовем только если adapter пришлёт publicKey в meta. Пока no-op
        // если не парсится.
        if (request.meta) {
          const m = JSON.parse(request.meta) as { dappPublicKey?: string };
          if (m.dappPublicKey) {
            await touchDappConnection({ data: { publicKey: m.dappPublicKey } });
          }
        }
      } catch {
        /* ignore */
      }
      return hashes;
    },
    onSuccess: (hashes) => {
      if (!request) return;
      toast.success(t("wsign.toast_signed"));
      const u = returnUrlOrThrow(request.callbackUrl);
      u.searchParams.set("transactionHashes", hashes.join(","));
      if (request.meta) u.searchParams.set("meta", request.meta);
      window.location.href = u.toString();
    },
    onError: (e: Error) => {
      const m = e.message || "";
      const human =
        m === "APP_PWD_SETUP"
          ? t("wvault.need_setup")
          : m === "PIN_REQUIRED"
            ? t("wsign.enter_pin")
            : m === "APP_PWD_REQUIRED" || m === "APP_LOCKED"
              ? t("wsign.enter_wallet_password")
              : m.includes("Неверный PIN")
                ? t("wsign.wrong_pin")
                : m.includes("Master заблокирован")
                  ? t("wsign.enter_pin")
                  : m;
      toast.error(human);
    },
  });

  const reject = () => {
    if (!request) {
      window.history.back();
      return;
    }
    try {
      const u = returnUrlOrThrow(request.callbackUrl);
      u.searchParams.set("errorCode", "userRejected");
      u.searchParams.set("errorMessage", "User rejected the request");
      if (request.meta) u.searchParams.set("meta", request.meta);
      window.location.href = u.toString();
    } catch {
      window.history.back();
    }
  };

  const totalDeposit = useMemo(() => {
    if (!request) return 0n;
    let sum = 0n;
    for (const tx of request.txs) {
      for (const a of tx.actions) {
        try {
          sum += BigInt(a.params?.deposit ?? "0");
        } catch {
          /* skip */
        }
      }
    }
    return sum;
  }, [request]);

  if (parseError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pb-20 pt-6">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-lg font-bold">{t("wsign.invalid_request")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{parseError}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!request) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-5 px-4 pb-24 pt-6">
        <header className="space-y-1 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("wsign.header_kicker")}
          </div>
          <h1 className="font-display text-2xl font-bold">
            YupLink <span className="text-gradient-gold">Wallet</span>
          </h1>
        </header>

        {/* Summary */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileSignature className="h-4 w-4 text-gold" />
            {request.txs.length === 1
              ? t("wsign.one_transaction")
              : t("wsign.n_transactions", { n: request.txs.length })}
          </div>
          {totalDeposit > 0n && (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("wsign.total_deposit")}{" "}
              <span className="font-mono text-foreground">{yoctoToNear(totalDeposit)} NEAR</span>
            </div>
          )}
        </div>

        {/* Tx list */}
        {request.txs.map((tx, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("wsign.receiver")}</span>
              <code className="font-mono text-gold">{tx.receiverId}</code>
            </div>
            <div className="space-y-2">
              {tx.actions.map((a, j) => (
                <div key={j} className="flex gap-2">
                  <ChevronRight className="mt-2 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <ActionPreview a={a} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Wallet picker */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <WalletIcon className="h-4 w-4 text-gold" />
            {t("wsign.signing_wallet")}
          </div>
          {wallets.length === 0 ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
              {t("wsign.no_wallets_prefix")}{" "}
              <a className="text-gold underline" href="/wallet">
                /wallet
              </a>{" "}
              {t("wsign.no_wallets_suffix")}
            </div>
          ) : (
            <select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
            >
              {wallets.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Пароль кошелька (app-lock) — если установлен и заблокирован */}
        {appLockNeeded && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-muted-foreground" />
              {t("wsign.wallet_password")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wsign.wallet_locked")}
              </span>
            </label>
            <input
              type="password"
              value={appPwd}
              onChange={(e) => setAppPwd(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
              autoComplete="current-password"
              autoFocus
            />
          </div>
        )}

        {/* PIN — показываем ТОЛЬКО для зашифрованных кошельков */}
        {pinNeeded && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-muted-foreground" />
              {t("wsign.pin_wallet")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wsign.wallet_encrypted")}
              </span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
              autoComplete="current-password"
              autoFocus
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={reject}
            disabled={approve.isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {t("wsign.reject")}
          </button>
          <button
            onClick={() => approve.mutate()}
            disabled={
              approve.isPending ||
              wallets.length === 0 ||
              !selectedWallet ||
              (appLockNeeded && !appPwd.trim())
            }
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50",
            )}
          >
            {approve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("wsign.sign")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
