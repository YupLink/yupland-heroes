import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Wallet as WalletIcon,
  Plug,
  Shield,
  Plus,
  KeyRound,
  LogIn,
  ArrowLeft,
} from "lucide-react";
import { getConnector } from "@/lib/near-connector";
import { useAppStore } from "@/lib/store";
import {
  listLocalWallets,
  createEmbeddedWallet,
  importEmbeddedWalletBySeed,
  importEmbeddedWalletByPrivateKey,
} from "@/lib/embeddedWallet";
import { registerEmbeddedWallet } from "@/server/api/embedded";
import { linkYupLinkWallet } from "@/lib/linkWallet";
import { SeedSaveGate } from "@/routes/admin.wallet";
import { useT } from "@/lib/i18n";
import { VaultGate } from "@/components/wallet/VaultGate";
import { vaultReady } from "@/lib/appLock";

// Вход встроенным кошем + регистрация на сервере (best-effort).
async function linkAndRegister(accountId: string, publicKey: string) {
  await linkYupLinkWallet(accountId);
  await registerEmbeddedWallet({ data: { accountId, publicKey } }).catch(() => undefined);
}

// Объединённое подключение кошелька: выбор между нашим YupLink-кошем
// (некастодиальный, ключ на устройстве) и внешним через HOT-коннектор.
// YupLink-ветка — свой под-выбор: войти в локальный / создать / импортировать.
export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const setWallet = useAppStore((s) => s.setWallet);
  const qc = useQueryClient();
  const [step, setStep] = useState<"choose" | "yuplink" | "import" | "busy" | "create" | "vault">(
    "choose",
  );
  const [created, setCreated] = useState<{
    accountId: string;
    publicKey: string;
    seedPhrase: string;
  } | null>(null);
  const [locals, setLocals] = useState<string[]>([]);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("choose");
      setCreated(null);
      setImportText("");
    }
  }, [open]);

  if (!open) return null;

  const finish = (accountId: string) => {
    setWallet(accountId);
    qc.invalidateQueries({ queryKey: ["session"] });
    onClose();
  };

  // Внешний кошелёк через коннектор — как было.
  const connectExternal = async () => {
    setStep("busy");
    try {
      const c = await getConnector();
      // Вошедший игрок добавляет кошелёк к своему Telegram — мост пристегнёт его
      // подписью только при этой метке (18.10.2026).
      const me = useAppStore.getState().walletAddress;
      if (me) useAppStore.getState().setPendingAddForWallet(me);
      if (c) await c.connect();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|reject|close/i.test(msg)) toast.error(t("wmodal.connect_error", { msg }));
      setStep("choose");
    }
  };

  // Ветка YupLink: показываем под-выбор (войти / создать / импорт).
  const openYupLink = async () => {
    setStep("busy");
    try {
      setLocals(await listLocalWallets());
    } catch {
      setLocals([]);
    }
    setStep(vaultReady() ? "yuplink" : "vault"); // пароль кошелька — до входа/создания
  };

  const loginLocal = async (accountId: string) => {
    setStep("busy");
    try {
      await linkYupLinkWallet(accountId);
      finish(accountId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wmodal.generic_error"));
      setStep("yuplink");
    }
  };

  const createNew = async () => {
    setStep("busy");
    try {
      const w = await createEmbeddedWallet();
      setCreated({ accountId: w.accountId, publicKey: w.publicKey, seedPhrase: w.seedPhrase });
      setStep("create");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wmodal.generic_error"));
      setStep("yuplink");
    }
  };

  // Умный импорт: ed25519:/секретный ключ → по ключу, иначе — сид-фраза.
  const doImport = async () => {
    const text = importText.trim();
    if (!text) return;
    setStep("busy");
    try {
      const res = text.includes("ed25519:")
        ? await importEmbeddedWalletByPrivateKey({ privateKeyStr: text })
        : await importEmbeddedWalletBySeed({ seedPhrase: text });
      await linkAndRegister(res.accountId, res.publicKey);
      toast.success(t("wmodal.import_success"));
      finish(res.accountId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wmodal.import_failed"));
      setStep("import");
    }
  };

  // После записи+проверки сида: сессия, регистрация, вход.
  const finishCreate = async () => {
    if (!created) return;
    setStep("busy");
    try {
      await linkAndRegister(created.accountId, created.publicKey);
      finish(created.accountId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wmodal.generic_error"));
      setStep("create");
    }
  };

  const optionCls =
    "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:border-gold/40";
  const iconCls =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-gold/30 bg-card p-5 shadow-card animate-float-up"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "create" && created ? (
          <div>
            <div className="mb-3 text-center font-display text-lg font-bold">
              {t("wmodal.yuplink_wallet")}
            </div>
            <SeedSaveGate seedPhrase={created.seedPhrase} onDone={finishCreate} />
          </div>
        ) : step === "vault" ? (
          <VaultGate onReady={() => setStep("yuplink")} />
        ) : step === "busy" ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("wmodal.connecting")}
          </div>
        ) : step === "yuplink" ? (
          <>
            <div className="text-center font-display text-lg font-bold">
              {t("wmodal.yuplink_wallet")}
            </div>
            <div className="mb-4 mt-0.5 text-center text-xs text-muted-foreground">
              {t("wmodal.yuplink_subtitle")}
            </div>
            {locals.map((a) => (
              <button
                key={a}
                onClick={() => loginLocal(a)}
                className={`${optionCls} mb-2 border-gold/40 bg-gold/10`}
              >
                <span className={`${iconCls} bg-gold/15 text-gold`}>
                  <LogIn className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t("wmodal.login")}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {a.length > 24 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a}
                  </span>
                </span>
              </button>
            ))}
            <button onClick={createNew} className={`${optionCls} mb-2`}>
              <span className={iconCls}>
                <Plus className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t("wmodal.create_new")}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("wmodal.create_new_desc")}
                </span>
              </span>
            </button>
            <button onClick={() => setStep("import")} className={optionCls}>
              <span className={iconCls}>
                <KeyRound className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t("wmodal.import")}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("wmodal.import_desc")}
                </span>
              </span>
            </button>
            <button
              onClick={() => setStep("choose")}
              className="mt-3 flex w-full items-center justify-center gap-1 text-center text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> {t("common.back")}
            </button>
          </>
        ) : step === "import" ? (
          <>
            <div className="text-center font-display text-lg font-bold">
              {t("wmodal.import_title")}
            </div>
            <div className="mb-3 mt-0.5 text-center text-xs text-muted-foreground">
              {t("wmodal.import_hint")}
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              placeholder={t("wmodal.import_placeholder")}
              className="w-full resize-none rounded-xl border border-border bg-background/40 px-3 py-2 font-mono text-xs outline-none focus:border-gold/50"
            />
            <button
              onClick={doImport}
              disabled={!importText.trim()}
              className="mt-3 w-full rounded-2xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition enabled:hover:scale-[1.01] disabled:opacity-40"
            >
              {t("wmodal.import")}
            </button>
            <button
              onClick={() => setStep("yuplink")}
              className="mt-3 flex w-full items-center justify-center gap-1 text-center text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> {t("common.back")}
            </button>
          </>
        ) : (
          <>
            <div className="text-center font-display text-lg font-bold">
              {t("header.connect_wallet")}
            </div>
            <div className="mb-4 mt-0.5 text-center text-xs text-muted-foreground">
              {t("wmodal.choose_subtitle")}
            </div>
            <button
              onClick={openYupLink}
              className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-left transition hover:bg-gold/15"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <WalletIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t("wmodal.yuplink_wallet")}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("wmodal.yuplink_option_desc")}
                </span>
              </span>
              <Shield className="h-4 w-4 shrink-0 text-gold/70" />
            </button>
            <button onClick={connectExternal} className={optionCls}>
              <span className={iconCls}>
                <Plug className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t("wmodal.external_wallet")}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("wmodal.external_wallet_desc")}
                </span>
              </span>
            </button>
            <button
              onClick={onClose}
              className="mt-3 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t("common.cancel")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
