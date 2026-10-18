import { Link } from "@tanstack/react-router";
import { Lock, ArrowLeft, Wallet as WalletIcon, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

export function TeaserScreen() {
  const t = useT();
  return (
    <div className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-8 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/40 bg-gold/10">
        <Lock className="h-7 w-7 text-gold" />
      </div>
      <h1 className="font-display text-2xl font-bold">
        {t("chips.brand_chips")} <span className="text-gradient-gold">{t("chips.soon")}</span>
      </h1>
      <Link
        to="/home"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium transition hover:bg-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("chips.back_to_yuplink")}
      </Link>
    </div>
  );
}

export function ConnectWalletScreen({ onConnect }: { onConnect: () => void }) {
  const t = useT();
  return (
    <div className="rounded-3xl border border-border bg-card/80 p-8 text-center backdrop-blur">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/40 bg-gold/10">
        <WalletIcon className="h-7 w-7 text-gold" />
      </div>
      <h2 className="font-display text-xl font-bold">{t("chips.connect_wallet")}</h2>
      <button
        onClick={onConnect}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl gradient-gold px-5 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"
      >
        <WalletIcon className="h-4 w-4" />
        {t("chips.connect")}
      </button>
    </div>
  );
}

export function ComingSoonTab({
  title,
  icon: Icon,
  desc,
}: {
  title: string;
  icon: typeof Sparkles;
  desc?: string;
}) {
  const t = useT();
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/20 px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
        <Icon className="h-7 w-7 text-amber-400" />
      </div>
      <div className="font-display text-lg font-bold">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-muted-foreground">
        {desc ?? t("chips.feature_in_dev")}
      </div>
    </div>
  );
}
