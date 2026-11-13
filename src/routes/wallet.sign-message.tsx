// YupLink Wallet · Sign Message (NEP-413).
// Off-chain подпись произвольного message с привязкой к recipient + nonce.
// Используется dApps для "Sign-in with NEAR" — login без транзакции.
//
// Поток (redirect-based):
//   1. dApp генерирует 32-byte nonce и открывает /wallet/sign-message?
//        message=<utf-8>
//       &recipient=mydapp.com
//       &nonce=<base64-32bytes>
//       &callbackUrl=https://dapp/back
//       &state=...           // опц., прокидываем обратно
//   2. Мы парсим, показываем что подписывается
//   3. Юзер выбирает свой embedded-кошелёк + PIN
//   4. Подписываем NEP-413 hash локальным privateKey
//   5. Редирект на callbackUrl?
//        accountId=alice.near
//       &publicKey=ed25519:<base58>
//       &signature=<base64-64bytes>
//       &state=...
//
// На отказ → callbackUrl?errorCode=userRejected
//
// Спека: https://github.com/near/NEPs/blob/master/neps/nep-0413.md

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Check, X, Mail, Lock, Wallet as WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { listLocalWallets, getKeyPairBytes } from "@/lib/embeddedWallet";
import { hasAppPassword, isAppUnlocked, unlockApp } from "@/lib/appLock";
import { signNep413, uint8ToBase64 } from "@/lib/nep413";
import { base58 } from "@scure/base";
import { useT } from "@/lib/i18n";
import { returnUrlOrThrow, safeReturnUrl } from "@/lib/walletReturnUrl";

export const Route = createFileRoute("/wallet/sign-message")({
  head: () => ({
    meta: [{ title: "Подпись сообщения — YupLink Wallet" }, { name: "robots", content: "noindex" }],
  }),
  component: SignMessagePage,
});

interface ParsedRequest {
  message: string;
  recipient: string;
  nonce: Uint8Array;
  callbackUrl: string;
  state: string | null;
}

function base64ToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseQuery(): ParsedRequest | { error: string } {
  if (typeof window === "undefined") return { error: "no-window" };
  const q = new URLSearchParams(window.location.search);
  const message = q.get("message") || "";
  const recipient = q.get("recipient") || "";
  const nonceStr = q.get("nonce") || "";
  const callbackUrl = q.get("callbackUrl") || q.get("callback_url") || "";
  const state = q.get("state");
  if (!message) return { error: "message обязателен" };
  if (!recipient) return { error: "recipient обязателен" };
  if (!nonceStr) return { error: "nonce обязателен (32 байта base64)" };
  if (!callbackUrl) return { error: "callbackUrl обязателен" };
  // Только https (и http на localhost): «javascript:» выполнил бы чужой код у нас.
  if (!safeReturnUrl(callbackUrl)) return { error: "callbackUrl должен быть https-адресом" };
  let nonce: Uint8Array;
  try {
    nonce = base64ToBytes(nonceStr);
  } catch {
    return { error: "nonce: не удалось декодировать base64" };
  }
  if (nonce.length !== 32) {
    return { error: `nonce должен быть 32 байта, получено ${nonce.length}` };
  }
  return { message, recipient, nonce, callbackUrl, state };
}

function SignMessagePage() {
  const t = useT();
  const [request, setRequest] = useState<ParsedRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(true);
  const [appPwd, setAppPwd] = useState("");
  const [appLockNeeded, setAppLockNeeded] = useState(false);

  useEffect(() => {
    const r = parseQuery();
    if ("error" in r) setParseError(r.error);
    else setRequest(r);
    setAppLockNeeded(hasAppPassword() && !isAppUnlocked());
  }, []);

  // Живой пересчёт замка (авто-лок мог сработать пока читали сообщение).
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
        if (list.length > 0) setSelectedWallet(list[0]);
      } catch {
        setWallets([]);
      }
    })();
  }, []);

  const approve = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("Нет запроса");
      if (!selectedWallet) throw new Error("Выбери кошелёк");
      // Разблокировка app-lock перед доступом к ключу (если установлен и заблокирован).
      if (hasAppPassword() && !isAppUnlocked()) {
        if (!appPwd.trim()) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd); // throws "Неверный пароль"
      }
      const kp = await getKeyPairBytes({
        accountId: selectedWallet,
        pin: needsPin ? pin : undefined,
      });
      const sig = await signNep413(
        {
          message: request.message,
          recipient: request.recipient,
          nonce: request.nonce,
        },
        kp.privateKey,
      );
      const publicKey = `ed25519:${base58.encode(kp.publicKey)}`;
      return {
        accountId: selectedWallet,
        publicKey,
        signature: uint8ToBase64(sig),
      };
    },
    onSuccess: (r) => {
      if (!request) return;
      toast.success(t("wsignmsg.toast_signed"));
      const u = returnUrlOrThrow(request.callbackUrl);
      u.searchParams.set("accountId", r.accountId);
      u.searchParams.set("publicKey", r.publicKey);
      u.searchParams.set("signature", r.signature);
      if (request.state) u.searchParams.set("state", request.state);
      window.location.href = u.toString();
    },
    onError: (e: Error) => {
      const m = e.message || "";
      toast.error(
        m === "APP_PWD_SETUP"
          ? t("wvault.need_setup")
          : m === "APP_PWD_REQUIRED" || m === "APP_LOCKED"
            ? t("wsignmsg.toast_enter_wallet_password")
            : m,
      );
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
      if (request.state) u.searchParams.set("state", request.state);
      window.location.href = u.toString();
    } catch {
      window.history.back();
    }
  };

  if (parseError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pb-20 pt-6">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-lg font-bold">{t("wsignmsg.invalid_request")}</h1>
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
            {t("wsignmsg.header_kicker")}
          </div>
          <h1 className="font-display text-2xl font-bold">
            YupLink <span className="text-gradient-gold">Wallet</span>
          </h1>
        </header>

        {/* Recipient */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-gold" />
            {t("wsignmsg.signing_for")}
          </div>
          <code className="mt-1 block break-all font-mono text-base text-gold">
            {request.recipient}
          </code>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("wsignmsg.recipient_desc_pre")} <b>{t("wsignmsg.recipient_desc_only")}</b>{" "}
            {t("wsignmsg.recipient_desc_post")}
          </p>
        </div>

        {/* Message */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold">{t("wsignmsg.message_label")}</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/30 p-3 text-xs leading-relaxed">
            {request.message}
          </pre>
        </div>

        {/* Wallet picker */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <WalletIcon className="h-4 w-4 text-gold" />
            {t("wsignmsg.signing_wallet")}
          </div>
          {wallets.length === 0 ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
              {t("wsignmsg.no_wallets_pre")}{" "}
              <a className="text-gold underline" href="/wallet">
                /wallet
              </a>{" "}
              {t("wsignmsg.no_wallets_post")}
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
              {t("wsignmsg.wallet_password")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wsignmsg.wallet_locked")}
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

        {/* PIN */}
        {wallets.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-muted-foreground" />
              {t("wsignmsg.wallet_pin")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wsignmsg.pin_hint")}
              </span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
              autoComplete="current-password"
            />
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={!needsPin}
                onChange={(e) => setNeedsPin(!e.target.checked)}
                className="h-3.5 w-3.5 accent-gold"
              />
              {t("wsignmsg.no_pin_label")}
            </label>
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
            {t("wsignmsg.reject")}
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
            {t("wsignmsg.sign")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
