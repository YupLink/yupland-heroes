// Публичная страница-роадмап: полноценный лендинг с таймлайном прогресса —
// что уже реализовано и куда движется проект дальше. Без дат, для показа
// команде/инвесторам. Доступна даже при включённом BETA_ADMIN_ONLY
// (см. allowlist в BetaGate.tsx).
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Sparkles,
  Wallet,
  Gift,
  Coins,
  Users,
  Search,
  DoorOpen,
  Layers,
  ShieldCheck,
  Lock,
  Map,
  Pickaxe,
  Hammer,
  Swords,
  Gem,
  ScrollText,
  EyeOff,
  Package,
  Rocket,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { GoldParticles } from "@/components/GoldParticles";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Роадмап — YupLink" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Что уже реализовано в YupLink и куда движется проект дальше.",
      },
    ],
  }),
  component: RoadmapPage,
});

type Milestone = { icon: LucideIcon; title: string };

const DONE: Milestone[] = [
  { icon: Wallet, title: "Вход по NEAR-кошельку + Telegram, сестринские кошельки объединяются в одного юзера" },
  { icon: Gift, title: "Дропы NFT: простые, наборы (комбо) и на фишках — с клеймом наград" },
  { icon: Coins, title: "Три валюты — билеты, $DARAI и энергия — с единым балансом" },
  { icon: Users, title: "Рефералы с бонусными тирами за приглашённых друзей" },
  { icon: Search, title: "Поиск и статистика по любому кошельку" },
  { icon: DoorOpen, title: "Прихожая: Юпик, уровни, сундуки, задания" },
  { icon: Layers, title: "Фишки: инвентарь, паки, крафт, стейкинг, PvP-дуэли, маркет" },
  { icon: ShieldCheck, title: "Полная админ-панель: дропы, голосования, магазин билетов, распределение $DARAI" },
  { icon: Lock, title: "Гейт закрытой беты — доступ только команде на время тестов" },
];

const NEXT: Milestone[] = [
  { icon: Map, title: "Карта земель с развилками и тропами для перемещения" },
  { icon: Pickaxe, title: "Шахты — добыча ресурсов и их захват с охраной" },
  { icon: Hammer, title: "Развитие замка: постройки, дерево строительства, стейкинг фишек в лайки" },
  { icon: Swords, title: "Герои из фишек: сбор команды, PvP в стиле «Героев 3»" },
  { icon: Gem, title: "Артефакты и лут — общий и расовый, особые сеты" },
  { icon: ScrollText, title: "Квесты и NPC в деревнях, инвентарь и крафт" },
  { icon: EyeOff, title: "Скрытые локации и секретные предложения" },
  { icon: Package, title: "Мистический бокс с призами" },
  { icon: Rocket, title: "Free-to-play режим" },
];

const STAR_DECOR = [
  { src: "/stars/5.webp", top: "6%", left: "8%", size: 34, delay: 0 },
  { src: "/stars/3.webp", top: "18%", left: "88%", size: 26, delay: 0.6 },
  { src: "/stars/4.webp", top: "42%", left: "4%", size: 22, delay: 1.2 },
  { src: "/stars/2.5.webp", top: "60%", left: "90%", size: 30, delay: 0.3 },
  { src: "/stars/1.5.webp", top: "80%", left: "10%", size: 24, delay: 0.9 },
  { src: "/stars/3.5.webp", top: "92%", left: "85%", size: 28, delay: 1.5 },
];

function Node({ m, i, variant }: { m: Milestone; i: number; variant: "done" | "next" }) {
  const Icon = m.icon;
  const done = variant === "done";
  return (
    <motion.div
      initial={{ opacity: 0, x: -18 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: (i % 6) * 0.05 }}
      className="relative flex items-start gap-4 pb-7 pl-1 last:pb-0"
    >
      <span
        className={
          "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border " +
          (done
            ? "gradient-gold border-gold/50 text-gold-foreground shadow-gold"
            : "border-border bg-card text-muted-foreground")
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <div
        className={
          "min-w-0 flex-1 rounded-2xl border p-4 transition " +
          (done
            ? "border-gold/20 bg-gold/5 hover:border-gold/40"
            : "border-border/60 bg-card hover:border-border")
        }
      >
        <p className={"text-sm leading-snug " + (done ? "text-foreground/95" : "text-foreground/80")}>
          {m.title}
        </p>
      </div>
    </motion.div>
  );
}

function RoadmapPage() {
  const total = DONE.length + NEXT.length;
  const pct = Math.round((DONE.length / total) * 100);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-30" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_60%)]" />

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center">
        <GoldParticles count={26} />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-xl"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-gold/10 shadow-gold">
            <img src="/yuplink-logo.webp" alt="YupLink" className="h-11 w-11 object-contain" />
          </div>

          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[11px] font-medium text-gold">
            <Sparkles className="h-3 w-3" />
            Закрытая бета · Роадмап
          </div>

          <h1 className="font-display text-4xl font-bold uppercase leading-tight tracking-wider sm:text-5xl">
            <span className="text-gradient-gold">Куда движется</span>
            <br />
            <span className="text-gradient-gold">YupLink</span>
          </h1>

          <p className="mx-auto mt-5 max-w-md text-sm text-muted-foreground sm:text-base">
            Игровая экосистема на NEAR: NFT-дропы, фишки, PvP и прокачка
            героя — уже работает. Ниже — что сделано и что впереди.
          </p>

          {/* Прогресс-бар запуска */}
          <div className="mx-auto mt-9 max-w-sm">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{DONE.length} готово</span>
              <span>{NEXT.length} впереди</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-secondary/50">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
                className="gradient-gold h-full rounded-full shadow-gold"
              />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Timeline */}
      <section className="relative px-6 pb-10">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {STAR_DECOR.map((s, i) => (
            <img
              key={i}
              src={s.src}
              alt=""
              className="absolute animate-mascot-bob opacity-20"
              style={{
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="mx-auto max-w-xl">
          <h2 className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Уже сделано
          </h2>

          <div className="relative">
            <div className="absolute left-[22px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/50 via-gold/50 to-border" />
            {DONE.map((m, i) => (
              <Node key={m.title} m={m} i={i} variant="done" />
            ))}

            {/* «Ты здесь» */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="relative flex items-center gap-4 pb-7 pl-1"
            >
              <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center">
                <span className="absolute h-11 w-11 animate-ping rounded-full bg-gold/30" />
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-gold bg-background shadow-gold" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
                <p className="text-sm font-bold text-gold">Мы здесь — закрытая бета</p>
              </div>
            </motion.div>

            {NEXT.map((m, i) => (
              <Node key={m.title} m={m} i={i} variant="next" />
            ))}
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <footer className="border-t border-border/50 px-6 py-12 text-center">
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Хочешь посмотреть, как это выглядит уже сейчас?
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-2 rounded-full gradient-gold px-6 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105"
        >
          Открыть YupLink
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-8 text-xs text-muted-foreground/70">
          YupLink · Powered by NEAR
        </p>
      </footer>
    </div>
  );
}
