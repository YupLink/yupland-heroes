import { Coins, ImageIcon, History, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletTab } from "./types";

export function WalletTabs({
  tab,
  onChange,
}: {
  tab: WalletTab;
  onChange: (t: WalletTab) => void;
}) {
  const tabs: {
    id: WalletTab;
    label: string;
    icon: React.ReactNode;
    activeCls: string;
  }[] = [
    {
      id: "assets",
      label: "Активы",
      icon: <Coins className="h-4 w-4" />,
      activeCls: "bg-gold/15 text-gold ring-1 ring-gold/30",
    },
    {
      id: "nft",
      label: "NFT",
      icon: <ImageIcon className="h-4 w-4" />,
      activeCls: "bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/30",
    },
    {
      id: "history",
      label: "История",
      icon: <History className="h-4 w-4" />,
      activeCls: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30",
    },
    {
      id: "dapps",
      label: "dApps",
      icon: <Plug className="h-4 w-4" />,
      activeCls: "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30",
    },
  ];
  return (
    <div className="flex gap-1 rounded-2xl border border-border bg-card/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-200",
            tab === t.id
              ? t.activeCls
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.icon}
          <span className="hidden xs:inline sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function HistoryTab() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <History className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
      <p className="text-sm font-medium">История транзакций — скоро</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
        Здесь появится лента входящих и исходящих переводов по этому кошельку.
      </p>
    </div>
  );
}
