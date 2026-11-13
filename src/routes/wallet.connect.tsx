// YupLink Wallet · Connect-flow.
// Публичный URL, на который dApp редиректит юзера для запроса доступа.
//
// Поток (redirect-based, как MyNearWallet):
//   1. dApp генерирует свой keypair локально
//   2. dApp открывает /wallet/connect?
//        success_url=https://dapp.com/callback
//       &failure_url=https://dapp.com/oops
//       &public_key=ed25519:<base58>           // pubkey dApp'а
//       &contract_id=v2.ref-finance.near       // опц. FCAK-target
//       &methods=swap,ft_transfer              // опц. список методов
//       &allowance=250000000000000000000000    // опц. лимит газа yocto
//       &app_name=Ref Finance                  // опц.
//       &app_icon=https://...png               // опц.
//   3. Мы парсим, показываем approve UI
//   4. Юзер выбирает свой embedded-кошелёк + вводит PIN
//   5. Подписываем AddKey on-chain → success_url?
//        account_id=alice.near
//       &public_key=ed25519:...               // эхо
//       &all_keys=ed25519:...                 // массив ключей
//       &transactionHashes=<hash>             // конвенция MNW
//
// Если юзер отклонил/закрыл → failure_url?errorCode=userRejected

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import {
  Shield,
  Loader2,
  AlertTriangle,
  Check,
  X,
  KeyRound,
  Lock,
  Wallet as WalletIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { listLocalWallets, signAndSendTx } from "@/lib/embeddedWallet";
import { hasAppPassword, isAppUnlocked, unlockApp } from "@/lib/appLock";
import { addKeyAction } from "@/lib/nearTx";
import { base58 } from "@scure/base";
import { saveWalletDappConnection } from "@/server/api/walletConnect";
import { CreateForm, ImportForm } from "@/routes/admin.wallet";
import { returnUrlOrThrow, safeReturnUrl } from "@/lib/walletReturnUrl";

export const Route = createFileRoute("/wallet/connect")({
  head: () => ({
    meta: [{ title: "Подключение dApp — YupLink Wallet" }, { name: "robots", content: "noindex" }],
  }),
  component: WalletConnectPage,
});

interface ParsedRequest {
  successUrl: string;
  failureUrl: string;
  publicKey: string; // ed25519:<base58>
  contractId: string | null;
  methods: string[];
  allowanceYocto: bigint | null;
  appName: string;
  appIcon: string | null;
  dappOrigin: string;
  isFullAccess: boolean;
}

function parseQuery(): ParsedRequest | { error: string } {
  if (typeof window === "undefined") return { error: "no-window" };
  const q = new URLSearchParams(window.location.search);
  const successUrl = q.get("success_url") || q.get("successUrl") || "";
  const failureUrl = q.get("failure_url") || q.get("failureUrl") || "";
  const publicKey = q.get("public_key") || q.get("publicKey") || "";
  if (!successUrl || !publicKey) {
    return { error: "success_url и public_key обязательны" };
  }
  // Только https (и http на localhost): «javascript:» выполнил бы чужой код у нас.
  if (!safeReturnUrl(successUrl) || (failureUrl && !safeReturnUrl(failureUrl))) {
    return { error: "success_url / failure_url должны быть https-адресами" };
  }
  if (!/^ed25519:/.test(publicKey)) {
    return { error: "public_key должен начинаться с ed25519:" };
  }
  const contractId = q.get("contract_id") || q.get("contractId") || null;
  const methodsRaw = q.get("methods") || "";
  const methods = methodsRaw
    ? methodsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const allowanceStr = q.get("allowance") || "";
  let allowanceYocto: bigint | null = null;
  if (allowanceStr) {
    try {
      allowanceYocto = BigInt(allowanceStr);
    } catch {
      /* ignore */
    }
  }
  const appName = q.get("app_name") || q.get("appName") || "Внешний dApp";
  const appIcon = q.get("app_icon") || q.get("appIcon") || null;
  // origin берём из success_url (надёжнее чем referrer, который часто пуст)
  let dappOrigin = "";
  try {
    const u = new URL(successUrl);
    dappOrigin = `${u.protocol}//${u.host}`;
  } catch {
    return { error: "success_url должен быть валидным URL" };
  }
  // Full access = contract_id не задан И нет methods/allowance.
  const isFullAccess = !contractId;
  return {
    successUrl,
    failureUrl,
    publicKey,
    contractId,
    methods,
    allowanceYocto,
    appName,
    appIcon,
    dappOrigin,
    isFullAccess,
  };
}

function WalletConnectPage() {
  const t = useT();
  const qc = useQueryClient();
  const [request, setRequest] = useState<ParsedRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(true);
  const [appPwd, setAppPwd] = useState("");
  const [appLockNeeded, setAppLockNeeded] = useState(false);
  // relayId !== null → используем мост (h4n.app-style), не редирект.
  const [relayId, setRelayId] = useState<string | null>(null);
  const [doneVia, setDoneVia] = useState<"redirect" | "relay" | null>(null);

  // Замок приложения: AddKey подписывается только разблокированным кошельком.
  useEffect(() => {
    const tick = () => setAppLockNeeded(hasAppPassword() && !isAppUnlocked());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Источник параметров: ?relay=<id> в URL ИЛИ Telegram start_param
    // вида "connect-<id>" (когда юзер открыл бота t.me/yuplink_bot?startapp=connect-<id>).
    const url = new URL(window.location.href);
    let rid = url.searchParams.get("relay") || "";
    if (!rid) {
      const tg = (
        window as unknown as {
          Telegram?: {
            WebApp?: { initDataUnsafe?: { start_param?: string } };
          };
        }
      ).Telegram?.WebApp;
      const sp = tg?.initDataUnsafe?.start_param ?? "";
      if (/^connect-/.test(sp)) rid = sp.replace(/^connect-/, "");
    }

    if (rid) {
      setRelayId(rid);
      (async () => {
        try {
          const res = await fetch("/api/wallet-relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get", id: rid }),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            setParseError(j.error ?? `relay: ${res.status}`);
            return;
          }
          const d = (await res.json()) as {
            publicKey: string;
            contractId: string | null;
            methods: string[];
            allowanceYocto: string | null;
            appName: string;
            appIcon: string | null;
          };
          // dappOrigin не пробрасывается через relay (dApp может быть какой угодно),
          // ставим пустой/«—», отображение почти не использует.
          setRequest({
            successUrl: "",
            failureUrl: "",
            publicKey: d.publicKey,
            contractId: d.contractId,
            methods: d.methods,
            allowanceYocto: d.allowanceYocto ? BigInt(d.allowanceYocto) : null,
            appName: d.appName,
            appIcon: d.appIcon,
            dappOrigin: "",
            isFullAccess: !d.contractId,
          });
        } catch (e) {
          setParseError((e as Error).message || "relay-fetch failed");
        }
      })();
      return;
    }
    // Fallback: классический MyNearWallet-style редирект-флоу (URL params).
    const r = parseQuery();
    if ("error" in r) setParseError(r.error);
    else setRequest(r);
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
      if (!request) throw new Error(t("wconnect.err_no_request"));
      if (!selectedWallet) throw new Error(t("wconnect.err_pick_wallet"));
      // Разблокировка app-lock перед подписью AddKey.
      if (hasAppPassword() && !isAppUnlocked()) {
        if (!appPwd.trim()) throw new Error("APP_PWD_REQUIRED");
        await unlockApp(appPwd); // throws "Неверный пароль"
      }
      // 1. publicKey dApp'a → raw bytes
      const pubKeyB58 = request.publicKey.replace(/^ed25519:/, "");
      const dappPubKey = base58.decode(pubKeyB58);
      if (dappPubKey.length !== 32) {
        throw new Error(t("wconnect.err_pubkey_32_bytes"));
      }
      // 2. AddKey action
      const action = addKeyAction({
        publicKey: dappPubKey,
        fcak: request.isFullAccess
          ? undefined
          : {
              receiverId: request.contractId!,
              methodNames: request.methods,
              allowanceYocto: request.allowanceYocto,
            },
      });
      // 3. Sign + send (AddKey идёт на signerId, receiverId === signerId)
      const r = await signAndSendTx({
        accountId: selectedWallet,
        pin: needsPin ? pin : undefined,
        receiverId: selectedWallet,
        actions: [action],
      });
      // 4. Save connection
      await saveWalletDappConnection({
        data: {
          wallet: selectedWallet,
          dappOrigin: request.dappOrigin,
          dappName: request.appName,
          dappIconUrl: request.appIcon || undefined,
          publicKey: request.publicKey,
          contractId: request.contractId,
          methods: request.methods.length > 0 ? request.methods : null,
          allowanceYocto: request.allowanceYocto ? request.allowanceYocto.toString() : null,
          grantedTxHash: r.txHash,
        },
      });
      return r;
    },
    onSuccess: async (r) => {
      if (!request) return;
      qc.invalidateQueries({ queryKey: ["my-dapp-connections"] });
      toast.success(t("wconnect.toast_access_granted"));

      if (relayId) {
        // Relay-режим: кладём ответ на сервер, dApp заберёт поллингом.
        try {
          await fetch("/api/wallet-relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "respond",
              id: relayId,
              status: "approved",
              accountId: selectedWallet,
              publicKey: request.publicKey,
              transactionHashes: r.txHash,
            }),
          });
        } catch {
          /* dApp всё равно может поллить пока не expired */
        }
        setDoneVia("relay");
        // Если внутри TG Mini App — закрываемся, юзер вернётся в чат.
        const tg = (
          window as unknown as {
            Telegram?: { WebApp?: { close?: () => void } };
          }
        ).Telegram?.WebApp;
        if (tg?.close) setTimeout(() => tg.close?.(), 1500);
        return;
      }

      // Редирект на success_url по конвенции MyNearWallet
      const u = returnUrlOrThrow(request.successUrl);
      u.searchParams.set("account_id", selectedWallet);
      u.searchParams.set("public_key", request.publicKey);
      u.searchParams.set("all_keys", request.publicKey);
      u.searchParams.set("transactionHashes", r.txHash);
      window.location.href = u.toString();
    },
    onError: (e: Error) => {
      const m = e.message || "";
      toast.error(
        m === "APP_PWD_SETUP"
          ? t("wvault.need_setup")
          : m === "APP_PWD_REQUIRED" || m === "APP_LOCKED"
            ? t("wconnect.err_enter_wallet_password")
            : m,
      );
    },
  });

  const reject = async () => {
    if (relayId) {
      try {
        await fetch("/api/wallet-relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "respond",
            id: relayId,
            status: "rejected",
          }),
        });
      } catch {
        /* ignore */
      }
      setDoneVia("relay");
      const tg = (
        window as unknown as {
          Telegram?: { WebApp?: { close?: () => void } };
        }
      ).Telegram?.WebApp;
      if (tg?.close) setTimeout(() => tg.close?.(), 1000);
      return;
    }
    if (!request) {
      window.history.back();
      return;
    }
    const url = request.failureUrl || request.successUrl;
    try {
      const u = returnUrlOrThrow(url);
      u.searchParams.set("errorCode", "userRejected");
      u.searchParams.set("errorMessage", "User rejected the request");
      window.location.href = u.toString();
    } catch {
      window.history.back();
    }
  };

  const allowanceHuman = useMemo(() => {
    if (!request?.allowanceYocto) return null;
    // 1 NEAR = 10^24 yocto
    const yocto = request.allowanceYocto;
    const near = Number(yocto) / 1e24;
    return near.toFixed(3) + " NEAR";
  }, [request]);

  if (doneVia === "relay") {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pb-20 pt-10">
          <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
            <Check className="mx-auto h-10 w-10 text-success" />
            <h1 className="mt-3 font-display text-lg font-bold">{t("wconnect.done")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("wconnect.done_close_window")}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (parseError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pb-20 pt-6">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-lg font-bold">{t("wconnect.invalid_request")}</h1>
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
            {t("wconnect.connection_request")}
          </div>
          <h1 className="font-display text-2xl font-bold">
            YupLink <span className="text-gradient-gold">Wallet</span>
          </h1>
        </header>

        {/* dApp card */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            {request.appIcon ? (
              <img
                src={request.appIcon}
                alt=""
                className="h-12 w-12 rounded-xl border border-border bg-background object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-secondary/40 text-muted-foreground">
                <KeyRound className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-base font-semibold">{request.appName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{request.dappOrigin}</div>
            </div>
          </div>
        </div>

        {/* What is being asked */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-success" />
            {t("wconnect.requests_permission")}
          </div>
          {request.isFullAccess ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t("wconnect.full_access_title")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("wconnect.full_access_desc_1")} <b>{t("wconnect.full_access_sign_any_tx")}</b>{" "}
                {t("wconnect.full_access_desc_2")}
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-border bg-secondary/30 p-2">
                <span className="text-muted-foreground">{t("wconnect.contract")}</span>{" "}
                <code className="font-mono text-gold">{request.contractId}</code>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-2">
                <span className="text-muted-foreground">{t("wconnect.methods")}</span>{" "}
                {request.methods.length > 0 ? (
                  <span className="font-mono">{request.methods.join(", ")}</span>
                ) : (
                  <span className="font-mono">{t("wconnect.all_contract_methods")}</span>
                )}
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-2">
                <span className="text-muted-foreground">{t("wconnect.gas_limit")}</span>{" "}
                <span className="font-mono">{allowanceHuman ?? "—"}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("wconnect.fcak_desc_1")} <b>function-call access key</b>{" "}
                {t("wconnect.fcak_desc_2")}
              </p>
            </div>
          )}
        </div>

        {/* Wallet picker */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <WalletIcon className="h-4 w-4 text-gold" />
            {t("wconnect.wallet_to_connect")}
          </div>
          {wallets.length === 0 ? (
            <InlineWalletSetup
              dappName={request.appName}
              onDone={async (accountId) => {
                // Перетянем актуальный список и выберем созданный/импортированный.
                try {
                  const fresh = await listLocalWallets();
                  setWallets(fresh);
                  setSelectedWallet(accountId);
                } catch {
                  /* ignore */
                }
              }}
            />
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
              {t("wconnect.wallet_password")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wconnect.wallet_locked")}
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
              {t("wconnect.wallet_pin")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("wconnect.pin_hint")}
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
              {t("wconnect.no_pin_label")}
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
            {t("wconnect.reject")}
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
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold shadow-gold transition disabled:opacity-50",
              request.isFullAccess
                ? "bg-destructive text-destructive-foreground hover:scale-[1.01]"
                : "gradient-gold text-gold-foreground hover:scale-[1.01]",
            )}
          >
            {approve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {request.isFullAccess ? t("wconnect.connect_understand_risk") : t("wconnect.connect")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

// ──────── Inline create/import — когда у юзера 0 кошельков и он в
// середине connect-flow. Контекст dApp остаётся на экране сверху, а тут
// прямо внутри connect-страницы можно создать или импортировать кошелёк.
// onDone({accountId}) подсасывает свежий список + автоматически выбирает.
function InlineWalletSetup({
  dappName,
  onDone,
}: {
  dappName: string;
  onDone: (accountId: string) => void | Promise<void>;
}) {
  const t = useT();
  const [mode, setMode] = useState<"choose" | "create" | "import">("choose");

  if (mode === "choose") {
    return (
      <div className="space-y-2.5">
        <p className="text-xs text-muted-foreground">
          {t("wconnect.setup_intro_1")} <b className="text-foreground">{dappName}</b>
          {t("wconnect.setup_intro_2")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("create")}
            className="flex items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
          >
            <KeyRound className="h-4 w-4" /> {t("common.create")}
          </button>
          <button
            type="button"
            onClick={() => setMode("import")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary"
          >
            <Shield className="h-4 w-4" /> {t("wconnect.import")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <CreateForm onDone={(accountId) => onDone(accountId)} onCancel={() => setMode("choose")} />
    );
  }

  return (
    <ImportForm onDone={(accountId) => onDone(accountId)} onCancel={() => setMode("choose")} />
  );
}
