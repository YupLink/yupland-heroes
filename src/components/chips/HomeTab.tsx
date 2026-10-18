import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Layers,
  Swords,
  Map as MapIcon,
  ArrowRight,
  Battery,
  Sparkles,
  Castle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { getMyEnergy } from "@/server/api/chips-stake";
import { energyTrend } from "@/lib/hooks/useEnergy";
import { myChipInventory } from "@/server/api/chips-pack";
import { getSession } from "@/server/api/user-auth";
import { ChipImage } from "@/components/ChipImage";
import { usePvpEnabled } from "./usePvpEnabled";

export function HomeTab({
  onPlay,
  onPvp,
  onShop,
  onChips,
  onBoss,
  onRaid,
  showRaid,
  hexRaid,
  onBetaRaid,
  showBetaRaid,
}: {
  onPlay: () => void;
  onPvp: () => void;
  onShop: () => void;
  onChips: () => void;
  onBoss: () => void;
  onRaid: () => void;
  showRaid: boolean;
  /** Гекс-карта стала основным рейдом: подпись плитки другая. */
  hexRaid?: boolean;
  onBetaRaid: () => void;
  showBetaRaid: boolean;
}) {
  const t = useT();
  const pvpOn = usePvpEnabled();
  const energy = useQuery({
    queryKey: ["my-energy"],
    queryFn: () => getMyEnergy(),
    refetchInterval: 60_000,
  });
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  // Кнопка «Внутрянка замка»: узкий круг (админы + дизайнер интерьера).
  // Флаг приходит из сессии — клиент не проверяет вайтлист сам.
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const canEditCastle = !!session.data?.isCastleEditor;
  const chipsCount = (inv.data ?? []).reduce((s, r) => s + r.count, 0);
  const preview = (inv.data ?? []).slice(0, 5);
  const nextRegen = energy.data?.nextRegenSec ?? 0;
  const minToNext = Math.ceil(nextRegen / 60);
  // Выше лимита следующая единица уходит, а не приходит (acc-45).
  const decaying = !!energy.data && energyTrend(energy.data) === "decay";

  return (
    <div className="space-y-3 pt-2">
      {/* Hero scene */}
      <section className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/15 via-gold/5 to-neon/10 p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gold/80">
          {t("chips.hero_kicker")}
        </div>
        <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight">
          {t("chips.hero_title_pre")}{" "}
          <span className="text-gradient-gold">{t("chips.hero_title_word")}</span>{" "}
          {t("chips.hero_title_post")}
        </h1>
        <p className="mt-1.5 max-w-md text-xs text-muted-foreground">{t("chips.hero_subtitle")}</p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Battery className="h-3 w-3 text-rose-400" />
            {energy.data?.energy ?? "—"}/{energy.data?.maxEnergy ?? 30}
            {nextRegen > 0 && (
              <span className="text-muted-foreground/60">
                {t(decaying ? "chips.next_unit_down_in" : "chips.next_unit_in", { n: minToNext })}
              </span>
            )}
          </span>
        </div>
      </section>

      {/* Твои фишки — превью со ссылкой в инвентарь */}
      {chipsCount > 0 && (
        <button
          type="button"
          onClick={onChips}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-2.5 text-left backdrop-blur transition hover:border-gold/40 hover:bg-card"
        >
          <div className="flex shrink-0 -space-x-3">
            {preview.map((c) => (
              <div
                key={c.id}
                className="h-11 w-11 overflow-hidden rounded-full border-2 border-background bg-secondary"
              >
                {c.imageUrl && (
                  <ChipImage
                    src={c.imageUrl}
                    level={c.level}
                    alt={c.templateName}
                    className="h-full w-full"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("chips.your_chips")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("chips.n_in_inventory", { n: chipsCount })}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* Действия — крупные карточки */}
      <div className="grid grid-cols-2 gap-2.5">
        <FeatureCard
          icon={Box}
          title={t("chips.nav_shop")}
          desc={t("chips.packs_for_tickets")}
          onClick={onShop}
        />
        <FeatureCard
          icon={Layers}
          title={t("chips.brand_chips")}
          desc={t("chips.n_pcs", { n: chipsCount })}
          onClick={onChips}
        />
        {pvpOn && (
          <FeatureCard icon={Swords} title="PvP" desc={t("chips.chip_battles")} onClick={onPvp} />
        )}
        {/* «Босс» (недельный PvE) скрыт для всех — заменён рейдами. */}
        {showRaid && (
          <FeatureCard
            icon={MapIcon}
            title="Рейд"
            desc={hexRaid ? "Карта · боссы, сундуки, постройки" : "Локации · цепочки боссов"}
            onClick={onRaid}
          />
        )}
        {showBetaRaid && (
          <FeatureCard
            icon={MapIcon}
            title="Бета рейд"
            desc="Гекс-карта · закрытый тест"
            onClick={onBetaRaid}
          />
        )}
      </div>

      {/* Внутрянка замка — свой мини-редактор, видит только узкий круг. */}
      {canEditCastle && (
        <Link
          to="/castle-editor"
          className="flex w-full items-center gap-3 rounded-2xl border border-gold/30 bg-card/60 p-3 text-left transition hover:border-gold/60"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold/10 text-gold">
            <Castle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Внутрянка замка</div>
            <div className="text-[11px] text-muted-foreground">
              Дизайн интерьера · только для команды
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}

// ─── Бета-рейд (экран) ───
function FeatureCard({
  icon: Icon,
  title,
  desc,
  soon,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  soon?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {soon && (
        <span className="absolute right-2 top-2 rounded-full bg-amber-400/20 px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-amber-400">
          soon
        </span>
      )}
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-2 text-sm font-bold">{title}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{desc}</div>
    </>
  );
  const cls =
    "relative flex flex-col items-center rounded-2xl border border-border bg-card/60 px-2 py-4 text-center backdrop-blur";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cls, "transition hover:border-gold/40 hover:bg-card")}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
