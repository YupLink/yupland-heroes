// Экран входа гостя на '/' (вынесен из WalletHome.tsx): Telegram, Google, NEAR-кошелёк.
import { GoldParticles } from "@/components/GoldParticles";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { WalletLoginButton } from "@/components/auth/WalletLoginButton";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { InviteLine } from "@/components/referrals/InviteLine";
import { WalletBackdrop } from "@/components/WalletBackdrop";
import { LangSwitch } from "@/components/LangSwitch";
import { useT } from "@/lib/i18n";
import { Wallet as WalletIcon } from "lucide-react";

export function WalletWelcome() {
  // Вход в YupLink — через Telegram (курс: ТГ = личность), Google (новые игроки, когда
  // вход открыт) или NEAR-кошельком с подписью — только старые аккаунты (владелец,
  // 06.11.2026: новый аккаунт — только Telegram или Google). Кошелёк привязывается внутри.
  const t = useT();
  return (
    <WalletBackdrop>
      <GoldParticles count={18} />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col items-center justify-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,var(--app-top,env(safe-area-inset-top,0px)))] text-center">
        {/* Кош-орб */}
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-7 animate-pulse rounded-full bg-gold/25 blur-2xl" />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] shadow-gold sm:h-28 sm:w-28"
            style={{ background: "var(--gradient-gold)" }}
          >
            <WalletIcon className="h-11 w-11 text-gold-foreground sm:h-12 sm:w-12" />
          </div>
        </div>

        <h1 className="font-display text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl">
          YupLink
          <span className="block text-gradient-gold">{t("whome.wallet")}</span>
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">{t("whome.ecosystem_wallet")}</p>
        <InviteLine className="mt-3 text-sm font-semibold text-gold" />

        {/* ОСНОВНОЙ вход — по Telegram, без кошелька (курс: ТГ = личность). */}
        <div className="mt-9 w-full">
          <TelegramLoginButton />
        </div>
        <GoogleLoginButton />
        {/* Вход по NEAR-кошельку (06.11.2026): только старые аккаунты. */}
        <div className="mt-3 w-full">
          <WalletLoginButton />
        </div>

        <div className="mt-6 text-xs text-muted-foreground/60">
          {t("whome.built_with_community")}
        </div>

        {/* Язык — прямо здесь: приложение открывается на английском, и человек
            должен суметь переключиться до входа, а не искать настройку внутри. */}
        <LangSwitch variant="pill" className="mt-7" />

        {/* Подвал — прижат к низу экрана */}
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-[11px] text-muted-foreground/50">
          2026 YupLand
        </div>
      </div>
    </WalletBackdrop>
  );
}
