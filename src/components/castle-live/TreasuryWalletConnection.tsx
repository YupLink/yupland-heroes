import { Wallet, Check, ArrowRight, Plug, Shield, ArrowLeft } from "lucide-react";
import { copyText } from "@/lib/copyText";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { humanError } from "@/lib/humanError";
import { VaultGate } from "@/components/wallet/VaultGate";
import { vaultReady } from "@/lib/appLock";

const buttonClass =
  "min-h-11 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-left text-sm font-semibold hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50";

/** Existing-wallet entry only; no connector or device reads on mount. */
export function TreasuryWalletConnection({ wallet, status, onPreviewWalletChange, openOnMount = false, purpose = "payments" }: { wallet: string | null; status?: "connected" | "disconnected"; onPreviewWalletChange?: (connected: boolean, name?: string) => void; openOnMount?: boolean; purpose?: "payments" | "nft" }) {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const setWallet = useAppStore((state) => state.setWallet);
  const [showMethods, setShowMethods] = useState(openOnMount);
  const [previewExternal, setPreviewExternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locals, setLocals] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setVaultTick] = useState(0);
  useEffect(() => {
    if (!showMethods) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowMethods(false); setPreviewExternal(false); }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showMethods]);

  const run = async (action: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/cancel|reject|close/i.test(message))
        setNotice(en ? "Connection cancelled." : "Подключение отменено.");
      else setError(humanError(cause instanceof Error ? cause : new Error(message)));
    } finally {
      setPending(false);
    }
  };

  const external = () =>
    run(async () => {
      // The existing NearConnectorBridge completes signed login.
      const { getConnector } = await import("@/lib/near-connector");
      const connector = await getConnector();
      if (!connector)
        throw new Error(en ? "Wallet connector unavailable." : "Подключение кошелька недоступно.");
      await connector.connect();
      await qc.invalidateQueries({ queryKey: ["session"] });
    });

  const showLocal = () =>
    run(async () => {
      const { listLocalWallets } = await import("@/lib/embeddedWallet");
      setLocals(await listLocalWallets());
    });

  const connectLocal = (accountId: string) =>
    run(async () => {
      const { linkYupLinkWallet } = await import("@/lib/linkWallet");
      const activeWallet = await linkYupLinkWallet(accountId);
      setWallet(activeWallet);
      await qc.invalidateQueries();
      setLocals(null);
      setNotice(en ? "Wallet connected." : "Кошелёк подключён.");
      onPreviewWalletChange?.(true, "Кошелёк YupLink");
      closeChoices();
    });

  const disconnectNear = () =>
    run(async () => {
      try {
        const { getConnector } = await import("@/lib/near-connector");
        const c = await getConnector();
        await (c as unknown as { signOut?: () => Promise<void> })?.signOut?.();
      } catch {
        /* коннектор мог быть не инициализирован */
      }
      const { disconnectWallet } = await import("@/server/api/user");
      await disconnectWallet();
      setWallet(null);
      await qc.invalidateQueries();
      setNotice(en ? "Wallet disconnected." : "Кошелёк отвязан.");
    });

  const isConnected = status ? status === "connected" : Boolean(wallet);
  const closeChoices = () => { setShowMethods(false); setPreviewExternal(false); setLocals(null); };

  return (
    <section className={`castle-profile__wallet rounded-xl border border-border p-3 ${isConnected ? "" : "castle-profile__wallet--entry"}`} aria-busy={pending}>
      {isConnected ? <div className="castle-profile__wallet-heading">
        <Wallet aria-hidden="true" />
        <div><h3>{en ? "Wallet" : "Кошелёк"}</h3>
          <p className="castle-profile__wallet-status castle-profile__wallet-status--connected"><Check aria-hidden="true" />{en ? "Connected" : "Подключён"}</p>
        </div>
      </div> : purpose === "payments" ? <p className="castle-profile__payment-purpose">{en ? "Additional payment methods" : "Дополнительные способы оплаты"}</p> : null}
      {isConnected ? <>
        <button data-game-button="primary" type="button" className="castle-profile__wallet-cta inline-flex items-center justify-center gap-2" onClick={() => setShowMethods(true)}><Wallet aria-hidden="true" className="h-4 w-4" />{en ? "Connect a wallet" : "Привязать кошелёк"}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
        {onPreviewWalletChange && <button data-game-button="secondary" type="button" className={`${buttonClass} castle-profile__manage`} onClick={() => onPreviewWalletChange(false)}>{en ? "Disconnect wallet" : "Отключить кошелёк"}</button>}
        {!onPreviewWalletChange && <button data-game-button="secondary" type="button" className={`${buttonClass} castle-profile__manage`} disabled={pending} onClick={() => void disconnectNear()}>{en ? "Disconnect wallet" : "Отвязать кошелёк"}</button>}
        {wallet && <details className="castle-profile__address"><summary>{en ? "Game account address" : "Адрес игрового аккаунта"}</summary><div className="space-y-2 py-2"><p className="break-all font-mono text-sm">{wallet}</p><button data-game-button="secondary" className={buttonClass} onClick={() => void copyText(wallet).then(ok => setNotice(ok ? (en ? "Address copied." : "Адрес скопирован.") : (en ? "Could not copy." : "Не удалось скопировать.")))}>{en ? "Copy address" : "Скопировать адрес"}</button></div></details>}
      </> : <button data-game-button="primary" type="button" className="castle-profile__wallet-cta inline-flex items-center justify-center gap-2" onClick={() => setShowMethods(true)}><Wallet aria-hidden="true" className="h-4 w-4" />{en ? "Connect wallet" : "Подключить кошелёк"}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {showMethods && <Dialog open={showMethods} onOpenChange={open => { if (!open) closeChoices(); }}>
        <DialogContent className="castle-wallet-choice" overlayClassName="z-[164]" closeLabel={en ? "Close" : "Закрыть"}>
          <DialogDescription className="sr-only">{en ? "Choose a wallet connection method" : "Выбери способ подключения кошелька"}</DialogDescription>
          {previewExternal ? <>
            <button className="castle-wallet-choice__back" type="button" onClick={() => setPreviewExternal(false)}><ArrowLeft aria-hidden="true" />{en ? "Back" : "Назад"}</button>
            <DialogTitle>{en ? "Select wallet" : "Выбери кошелёк"}</DialogTitle>
            <div className="castle-wallet-choice__wallet-list">{["HOT Wallet", "Meteor Wallet", "Intear Wallet", "Ledger", "MyNearWallet"].map(name => <button key={name} type="button" onClick={() => { onPreviewWalletChange?.(true, name); closeChoices(); }}>{name}</button>)}</div>
            <p className="castle-wallet-choice__connector">NEAR Connector</p>
          </> : locals !== null ? <>
            <DialogTitle>{en ? "YupLink Wallet" : "Кошелёк YupLink"}</DialogTitle>
            {locals.length > 0 && !vaultReady() ? <VaultGate onReady={() => setVaultTick(n => n + 1)} /> : <div className="castle-wallet-choice__wallet-list">{locals.map(accountId => <button key={accountId} type="button" onClick={() => void connectLocal(accountId)}>{accountId}</button>)}</div>}
            {!locals.length && <p>{en ? "No saved wallet on this device" : "На устройстве нет сохранённого кошелька"}</p>}
            <button className="castle-wallet-choice__cancel" type="button" onClick={() => setLocals(null)}>{en ? "Back" : "Назад"}</button>
          </> : <>
            <DialogTitle>{en ? "Connect wallet" : "Подключить кошелёк"}</DialogTitle>
            <p className="castle-wallet-choice__subtitle">{en ? "Choose how to sign in" : "Выбери, как войти"}</p>
            <button className="castle-wallet-choice__option castle-wallet-choice__option--yuplink" type="button" disabled={pending} onClick={() => void showLocal()}><span className="castle-wallet-choice__icon"><Wallet aria-hidden="true" /></span><span><strong>{en ? "YupLink Wallet" : "Кошелёк YupLink"}</strong><small>{en ? "Our non-custodial · key on your device" : "Наш некастодиальный · ключ на устройстве"}</small></span><Shield aria-hidden="true" /></button>
            <button className="castle-wallet-choice__option" type="button" disabled={pending} onClick={() => onPreviewWalletChange ? setPreviewExternal(true) : void external()}><span className="castle-wallet-choice__icon"><Plug aria-hidden="true" /></span><span><strong>{en ? "External wallet" : "Внешний кошелёк"}</strong><small>{en ? "HOT and others (NEAR connector)" : "HOT и другие (NEAR-коннектор)"}</small></span></button>
            {pending && <p role="status">{en ? "Please wait…" : "Подожди…"}</p>}
            {error && <p role="alert">{error}</p>}
            <button className="castle-wallet-choice__cancel" type="button" onClick={closeChoices}>{en ? "Cancel" : "Отмена"}</button>
          </>}
        </DialogContent>
      </Dialog>}
    </section>
  );
}
