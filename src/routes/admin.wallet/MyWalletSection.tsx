import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Wallet as WalletIcon, Loader2 } from "lucide-react";
import { listLocalWallets } from "@/lib/embeddedWallet";
import { getLastActiveWallet, setLastActiveWallet } from "@/lib/walletStorage";
import { hasAppPassword, isAppUnlocked } from "@/lib/appLock";
import { ConnectedDappsSection } from "@/components/ConnectedDappsSection";
import { ReceivePanel } from "@/components/wallet/ReceivePanel";
import { SectionHeading } from "./inputs";
import { WalletHero } from "./WalletHero";
import { WalletTabs } from "./WalletTabs";
import { AssetsTab } from "./AssetsTab";
import { NftTab } from "./NftTab";
import { HistoryTab } from "./WalletTabs";
import { WalletPickerSheet } from "./WalletPickerSheet";
import { WalletSettingsSheet } from "./WalletSettingsSheet";
import { SendModal } from "./SendModal";
import { UnlockGate } from "./UnlockGate";
import { AddChoice } from "./AddChoice";
import { CreateForm } from "./CreateForm";
import { ImportForm } from "./ImportForm";
import type { SendTarget } from "./types";

export function MyWalletSection() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"list" | "add" | "create" | "import">("list");
  const [tab, setTab] = useState<"assets" | "nft" | "history" | "dapps">("assets");
  const [active, setActive] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null);
  const [locked, setLocked] = useState(() => hasAppPassword() && !isAppUnlocked());

  useEffect(() => {
    const t = setInterval(() => {
      const l = hasAppPassword() && !isAppUnlocked();
      setLocked((prev) => (prev === l ? prev : l));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const selectWallet = (a: string) => {
    setActive(a);
    setLastActiveWallet(a);
    setShowReceive(false);
    setTab("assets");
    setShowWalletPicker(false);
  };

  const local = useQuery({
    queryKey: ["local", "wallets"],
    queryFn: () => listLocalWallets(),
  });

  const wallets = local.data ?? [];

  useEffect(() => {
    if (wallets.length === 0) {
      if (active !== null) setActive(null);
      return;
    }
    if (!active || !wallets.includes(active)) {
      const last = getLastActiveWallet();
      setActive(last && wallets.includes(last) ? last : wallets[0]);
    }
  }, [wallets.join(",")]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["local", "wallets"] });
    qc.invalidateQueries({ queryKey: ["admin", "wallets"] });
  };

  const refreshAssets = (accountId: string) => {
    qc.invalidateQueries({ queryKey: ["my", "wallet", accountId] });
  };

  if (mode === "add") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading icon={<Plus className="h-4 w-4" />} title="Добавить кошелёк" />
        <AddChoice onCreate={() => setMode("create")} onImport={() => setMode("import")} onCancel={() => setMode("list")} />
      </section>
    );
  }

  if (mode === "create") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading icon={<Plus className="h-4 w-4" />} title="Новый кошелёк" />
        <CreateForm onDone={(accountId) => { setMode("list"); setActive(accountId); setLastActiveWallet(accountId); refresh(); }} onCancel={() => setMode("add")} />
      </section>
    );
  }

  if (mode === "import") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading icon={<KeyRound className="h-4 w-4" />} title="Импорт кошелька" />
        <ImportForm onDone={(accountId) => { setMode("list"); setActive(accountId); setLastActiveWallet(accountId); refresh(); }} onCancel={() => setMode("add")} />
      </section>
    );
  }

  if (!local.isLoading && wallets.length === 0) {
    return (
      <section className="overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-6 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold glow-gold">
          <WalletIcon className="h-8 w-8" />
        </div>
        <h2 className="font-display text-xl font-bold">Заведи кошелёк NEAR</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Создай новый аккаунт прямо в приложении или импортируй существующий по сид-фразе либо приватному ключу. Ключ хранится только на этом устройстве.
        </p>
        <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
          <button onClick={() => setMode("add")} className="flex items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]">
            <Plus className="h-4 w-4" /> Добавить кошелёк
          </button>
        </div>
      </section>
    );
  }

  if (local.isLoading || !active) {
    return (
      <section className="flex items-center justify-center rounded-3xl border border-border bg-card/40 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (locked) {
    return <UnlockGate onUnlocked={() => setLocked(false)} />;
  }

  return (
    <section className="space-y-3 animate-float-up">
      <WalletHero
        accountId={active}
        wallets={wallets}
        onOpenPicker={() => setShowWalletPicker(true)}
        onSend={() => setSendTarget({ kind: "near", nearYocto: "0", lazy: true })}
        onReceive={() => setShowReceive((v) => !v)}
        receiveOpen={showReceive}
        onSettings={() => setShowSettings(true)}
        onAdd={() => setMode("add")}
      />
      {showReceive && <ReceivePanel accountId={active} />}
      <WalletTabs tab={tab} onChange={setTab} />
      <div className="min-h-[120px]">
        {tab === "assets" && <AssetsTab accountId={active} onSend={(t) => setSendTarget(t)} />}
        {tab === "nft" && <NftTab accountId={active} onSend={(t) => setSendTarget(t)} />}
        {tab === "history" && <HistoryTab />}
        {tab === "dapps" && <ConnectedDappsSection />}
      </div>
      {showSettings && (
        <WalletSettingsSheet accountId={active} onClose={() => setShowSettings(false)} onRemoved={() => { setShowSettings(false); refresh(); }} />
      )}
      {showWalletPicker && (
        <WalletPickerSheet wallets={wallets} active={active} onSelect={selectWallet} onAdd={() => { setShowWalletPicker(false); setMode("add"); }} onClose={() => setShowWalletPicker(false)} />
      )}
      {sendTarget && (
        <SendModal accountId={active} target={sendTarget} onClose={() => setSendTarget(null)} onSuccess={() => { setSendTarget(null); refreshAssets(active); }} />
      )}
    </section>
  );
}
