// Главная YupLink (бывший '/') — вынесена 1-в-1 из routes/index.tsx.
// Теперь живёт на /home: '/' = кошелёк («кош наоборот», одобрено 03.07).
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { GoldParticles } from "@/components/GoldParticles";
import { TelegramLoginModal } from "@/components/auth/TelegramLoginModal";
import { TelegramVerify } from "@/components/TelegramVerify";
import { ProfileChip } from "@/components/ProfilePanel";
import { useAppStore } from "@/lib/store";
import { useSetLang } from "@/lib/langPrefs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { redeemLoginCode } from "@/server/api/loginCode";
import { toast } from "sonner";
import {
  Sparkles,
  Dice5,
  Gift,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Coins,
  Wallet,
} from "lucide-react";

// FAQ-ключи. Тексты локализуются через t() в момент рендера внутри компонента
// (хук нельзя вызывать на уровне модуля).
const faqs = [
  { qKey: "landing.faq1_q", aKey: "landing.faq1_a" },
  { qKey: "landing.faq2_q", aKey: "landing.faq2_a" },
  { qKey: "landing.faq3_q", aKey: "landing.faq3_a" },
  { qKey: "landing.faq4_q", aKey: "landing.faq4_a" },
  { qKey: "landing.faq5_q", aKey: "landing.faq5_a" },
  { qKey: "landing.faq6_q", aKey: "landing.faq6_a" },
];

export function LandingPage() {
  const t = useT();
  const [walletOpen, setWalletOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const submitLoginCode = async () => {
    if (codeBusy || loginCode.trim().length < 4) return;
    setCodeBusy(true);
    try {
      const r = await redeemLoginCode({ data: { code: loginCode } });
      if (r.ok) window.location.href = "/home";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось войти по коду");
    } finally {
      setCodeBusy(false);
    }
  };
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [faqSectionOpen, setFaqSectionOpen] = useState(false);
  const { walletConnected } = useAppStore();
  const lang = useAppStore((s) => s.lang);
  const setLang = useSetLang();
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const needsTg = !!session?.wallet && !session.telegramLinked;

  return (
    <AppShell>
      {needsTg && (
        <section className="px-4 pt-6">
          <div className="mx-auto max-w-md">
            <TelegramVerify />
          </div>
        </section>
      )}

      {/* Компактный профиль-chip: уровень + энергия. Полный набор
          (XP-bar, ачивки, репутация) — в попап-панели по клику. */}
      {walletConnected && (
        <section className="px-4 pt-6">
          <div className="mx-auto flex max-w-3xl justify-center">
            <ProfileChip />
          </div>
        </section>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-12 pt-9">
        <GoldParticles count={24} />
        <div className="relative mx-auto max-w-3xl text-center">
          {/* Переключатель языка на главной (дублирует шапку — сразу на виду) */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex gap-1 rounded-full border border-gold/30 bg-card/60 p-0.5 text-xs font-semibold backdrop-blur">
              {(["ru", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded-full px-3 py-1 transition",
                    lang === l
                      ? "bg-gold/20 text-gold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[11px] font-medium text-gold">
            <Sparkles className="h-3 w-3" />
            {t("landing.kicker")}
          </div>

          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t("landing.hero_line1")} <br />
            <span className="text-gradient-gold">
              {t("landing.hero_line2")}
            </span>
            <br />
            {t("landing.hero_line3")}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            {t("landing.hero_sub")}
          </p>

          <div className="mt-6 flex justify-center">
            {walletConnected ? (
              <Link
                to="/my-nfts"
                className="inline-flex items-center gap-2 rounded-full gradient-gold px-6 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105 animate-pulse-gold"
              >
                <Gift className="h-4 w-4" />
                {t("landing.cta_open_nfts")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={() => setWalletOpen(true)}
                className="inline-flex items-center gap-2 rounded-full gradient-gold px-6 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105 animate-pulse-gold"
              >
                <Wallet className="h-4 w-4" />
                {t("auth.tg_login")}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Вход по коду из приложения (полная автономность — без кошелька). */}
          {!walletConnected && (
            <div className="mx-auto mt-3 max-w-xs">
              {!codeOpen ? (
                <button
                  type="button"
                  onClick={() => setCodeOpen(true)}
                  className="text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
                >
                  Войти по коду из приложения
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={loginCode}
                    onChange={(e) =>
                      setLoginCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                      )
                    }
                    onKeyDown={(e) => e.key === "Enter" && submitLoginCode()}
                    placeholder="КОД"
                    maxLength={8}
                    autoFocus
                    className="flex-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-center text-sm font-bold tracking-[0.3em] outline-none focus:border-gold/50"
                  />
                  <button
                    type="button"
                    onClick={submitLoginCode}
                    disabled={codeBusy || loginCode.trim().length < 4}
                    className="rounded-lg gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
                  >
                    {codeBusy ? "…" : "Войти"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Фишки — отдельная неоновая кнопка (перенесена из «Ещё»).
              Вращающаяся conic-рамка + шиммер + жетон-фишка. */}
          <div className="mx-auto mt-4 max-w-sm">
            <Link
              to="/chips"
              className="group relative block overflow-hidden rounded-2xl p-[1.5px] shadow-neon transition hover:scale-[1.02]"
            >
              {/* Вращающаяся неон→gold рамка */}
              <span
                className="pointer-events-none absolute -inset-[60%] animate-spin"
                style={{
                  animationDuration: "5s",
                  background:
                    "conic-gradient(from 0deg, transparent 0 55%, var(--color-neon) 72%, var(--color-gold) 88%, transparent 100%)",
                }}
              />
              {/* Внутренняя стеклянная панель */}
              <span className="relative flex items-center gap-4 rounded-2xl bg-card/95 px-5 py-4 backdrop-blur-xl">
                {/* Жетон-фишка */}
                <span className="relative grid h-12 w-12 shrink-0 place-items-center">
                  <span className="absolute h-11 w-11 rounded-full bg-neon/25 blur-md transition group-hover:bg-neon/40" />
                  <span
                    className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-neon/70 text-neon transition group-hover:rotate-180"
                    style={{
                      background:
                        "radial-gradient(circle at 30% 30%, oklch(0.86 0.13 200 / 0.35), oklch(0.7 0.17 70 / 0.25))",
                      transitionDuration: "0.6s",
                    }}
                  >
                    <Coins className="h-5 w-5" />
                  </span>
                </span>

                {/* Текст */}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-display text-lg font-bold leading-tight">
                    <span className="text-gradient-gold">
                      {t("landing.chips_cta")}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("landing.chips_tagline")}
                  </span>
                </span>

                <ChevronRight className="h-5 w-5 shrink-0 text-neon transition group-hover:translate-x-1" />

                {/* Бегущий блик */}
                <span className="animate-shimmer pointer-events-none absolute inset-0 rounded-2xl" />
              </span>
            </Link>
          </div>

          {/* Floating hero bag */}
          <div className="relative mx-auto mt-8 h-32 w-32">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gold/10 blur-3xl" />
            <div className="relative flex h-full w-full items-center justify-center">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full shadow-gold"
                style={{ background: "var(--gradient-gold)" }}
              >
                <Gift className="h-10 w-10 text-gold-foreground" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — раскрывающееся меню */}
      <section id="how" className="px-4 pt-4">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setHowOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left font-display text-base font-bold transition hover:border-gold/30"
          >
            {t("landing.how_it_works")}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition ${howOpen ? "rotate-180 text-gold" : ""}`}
            />
          </button>
          {howOpen && (
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            {[
              {
                icon: Wallet,
                title: t("landing.step1_title"),
                desc: t("landing.step1_desc"),
              },
              {
                icon: Gift,
                title: t("landing.step2_title"),
                desc: t("landing.step2_desc"),
              },
              {
                icon: Dice5,
                title: t("landing.step3_title"),
                desc: t("landing.step3_desc"),
              },
            ].map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-gold/30 sm:flex-col sm:items-start sm:p-4"
              >
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      0{i + 1}
                    </span>
                    <span className="font-display text-sm font-bold">
                      {step.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* FAQ — раскрывающееся меню */}
      <section className="px-4 pt-2.5">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => setFaqSectionOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left font-display text-base font-bold transition hover:border-gold/30"
          >
            {t("landing.faq")}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition ${faqSectionOpen ? "rotate-180 text-gold" : ""}`}
            />
          </button>
          {faqSectionOpen && (
          <div className="mt-2.5 space-y-2">
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  >
                    {t(f.qKey)}
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180 text-gold" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 text-sm text-muted-foreground animate-float-up">
                      {t(f.aKey)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      </section>

      <footer className="border-t border-border/50 px-4 py-6 text-center text-xs text-muted-foreground">
        YupLink · Powered by NEAR · {new Date().getFullYear()}
      </footer>

      <TelegramLoginModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </AppShell>
  );
}
