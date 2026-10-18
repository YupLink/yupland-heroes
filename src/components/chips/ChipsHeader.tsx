import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft, Wallet as WalletIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

export function ChipsHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium transition hover:bg-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          YupLink
        </Link>
        <div className="flex items-center gap-1.5 text-base font-bold uppercase tracking-[0.25em] text-foreground">
          <Sparkles className="h-4 w-4 text-gold" />
          <span className="text-gradient-gold font-display">{t("chips.brand_chips")}</span>
        </div>
        <Link
          to="/wallet"
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/20"
          title={t("chips.wallet_title")}
        >
          <WalletIcon className="h-3.5 w-3.5" />
          Wallet
        </Link>
      </div>
    </header>
  );
}
