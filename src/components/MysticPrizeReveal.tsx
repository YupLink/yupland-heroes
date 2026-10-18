// Показ приза из мистического бокса. Вынесен из MysticBoxesSection (файл
// упирался в 250 строк).
//
// Кроме анимации здесь есть главное для игрока: КУДА положили приз.
// В замке герой и артефакт ведут к соответствующему разделу Таверны.
import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Gem, Crown, Package, Ticket, Zap, ArrowRight, Heart, Pickaxe, ShoppingBag, Coins } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import { gotoChipsSub, type ChipsSubTab } from "@/lib/chipsNav";
import { heroRarity } from "@/components/heroMeta";
import type { MysticPrize } from "@/server/api/mystic";
import { rewardKindImage, rewardKindLabelKey } from "@/lib/rewardKinds";

const ART_RARITY: Record<string, { key: string; color: string }> = {
  common: { key: "chips.rarity_common", color: "#9aa4bd" },
  rare: { key: "chips.rarity_rare", color: "#5b9bff" },
  epic: { key: "chips.rarity_epic", color: "#b46bff" },
  legendary: { key: "chips.rarity_legendary", color: "#f5c451" },
};

/** Куда положили приз и как туда попасть. */
function whereOf(kind: string): { key: string; go?: ChipsSubTab; cta?: string } | null {
  if (kind === "artifact" || kind === "hero")
    return { key: "chips.mystic_where_items", go: "items", cta: "chips.mystic_go_items" };
  if (kind === "pack")
    return { key: "chips.mystic_where_packs", go: "packs", cta: "chips.mystic_go_packs" };
  if (kind === "custom") return { key: "chips.mystic_where_backpack" };
  if (kind === "resource") return { key: "chips.mystic_where_resources" };
  if (kind === "tickets" || kind === "energy" || kind === "likes" || kind === "token")
    return { key: "chips.mystic_where_balance" };
  return null;
}

export function MysticPrizeReveal({ prize, onClose, onViewMysticReward }: { prize: MysticPrize; onClose: () => void; onViewMysticReward?: (kind: MysticRewardDestination) => void }) {
  const t = useT();
  const ru = useLang() === "ru";
  const tavernReward = prize.kind === "hero" || prize.kind === "artifact" ? prize.kind : null;
  const meta: Record<string, { label: string; icon: typeof Package; color: string }> = {
    pack: { label: prize.name || t("chips.prize_pack"), icon: Package, color: "#a78bfa" },
    tickets: {
      label: t("chips.prize_tickets", { n: prize.amount ?? 0 }),
      icon: Ticket,
      color: "#f5c451",
    },
    energy: {
      label: t("chips.prize_energy", { n: prize.amount ?? 0 }),
      icon: Zap,
      color: "#41d3c6",
    },
    artifact: { label: prize.name || t("chips.prize_artifact"), icon: Gem, color: "#ff7be0" },
    hero: { label: prize.name || t("chips.prize_hero"), icon: Crown, color: "#ff6b6b" },
    likes: { label: t("chips.prize_likes", { n: prize.amount ?? 0 }), icon: Heart, color: "#fb7185" },
    resource: {
      label: t("chips.prize_amount", {
        n: prize.amount ?? 0,
        what: t(rewardKindLabelKey("resource", prize.code) ?? "braid.rw_custom"),
      }),
      icon: Pickaxe,
      color: "#c9a26b",
    },
    custom: {
      label: t("chips.prize_amount", { n: prize.amount ?? 1, what: prize.name || t("braid.rw_custom") }),
      icon: ShoppingBag,
      color: "#f59e0b",
    },
    token: {
      label: `${prize.amount ?? 0} ${prize.code === "Darai" ? "DARAI" : prize.code === "STARS" ? "⭐" : prize.code ?? ""}`,
      icon: Coins,
      color: "#34d399",
    },
    blank: { label: t("chips.mystic_blank"), icon: Sparkles, color: "#9aa4bd" },
  };
  // Ресурсу — его спрайт, если своей картинки у приза нет.
  const image = prize.image ?? (prize.kind === "resource" ? rewardKindImage(prize.code) : null);
  const m = meta[prize.kind] ?? meta.blank;
  const Icon = m.icon;
  const isBlank = prize.kind === "blank";
  const where = whereOf(prize.kind);
  // Искры-частицы (детерминированные позиции, без Math.random-мерцания).
  const sparks = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);

  const rar = (() => {
    if (prize.kind === "hero" && prize.level != null) {
      const hr = heroRarity(prize.level);
      return { label: hr.label, color: hr.color };
    }
    if (prize.kind === "artifact" && prize.rarity) {
      const r = ART_RARITY[prize.rarity];
      return r ? { label: t(r.key), color: r.color } : null;
    }
    return null;
  })();

  return createPortal(
    <div
      className="mb-reveal-root fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <style>{`
        @keyframes mbFade { from { opacity:0 } to { opacity:1 } }
        @keyframes mbPop { 0%{ transform:scale(.3); opacity:0 } 60%{ transform:scale(1.08); opacity:1 } 100%{ transform:scale(1) } }
        @keyframes mbSpin { to { transform:rotate(360deg) } }
        @keyframes mbGlow { 0%,100%{ opacity:.45; transform:scale(1) } 50%{ opacity:.9; transform:scale(1.12) } }
        @keyframes mbBurst { 0%{ transform:translate(-50%,-50%) scale(0); opacity:1 } 70%{ opacity:1 } 100%{ transform:translate(var(--dx),var(--dy)) scale(1); opacity:0 } }
        @keyframes mbRise { from{ transform:translateY(8px); opacity:0 } to{ transform:translateY(0); opacity:1 } }
        .mb-reveal-root{ animation:mbFade .18s ease-out }
        .mb-card{ animation:mbPop .5s cubic-bezier(.2,1.2,.35,1) both }
        .mb-ring{ animation:mbSpin 8s linear infinite }
        .mb-glow{ animation:mbGlow 1.8s ease-in-out infinite }
        .mb-spark{ position:absolute; left:50%; top:50%; width:7px; height:7px; border-radius:9999px; animation:mbBurst .9s ease-out forwards }
        .mb-label{ animation:mbRise .4s ease-out .25s both }
        @media (prefers-reduced-motion: reduce){ .mb-card,.mb-ring,.mb-glow,.mb-spark,.mb-label{ animation-duration:.01ms!important; animation-iteration-count:1!important } }
      `}</style>
      <div
        className="mb-card w-full max-w-xs overflow-hidden rounded-3xl border bg-card p-6 text-center"
        style={{ borderColor: m.color + "77" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mx-auto mb-4 h-28 w-28">
          {!isBlank && (
            <div
              className="mb-ring absolute inset-[-10px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${m.color}88, transparent 60%)`,
              }}
            />
          )}
          <div
            className="mb-glow absolute inset-0 rounded-2xl"
            style={{ boxShadow: `0 0 48px ${m.color}66`, background: m.color + "1f" }}
          />
          {!isBlank &&
            sparks.map((a, i) => (
              <span
                key={i}
                className="mb-spark"
                style={
                  {
                    background: m.color,
                    "--dx": `${Math.cos(a) * 70}px`,
                    "--dy": `${Math.sin(a) * 70}px`,
                    animationDelay: `${(i % 5) * 40}ms`,
                  } as CSSProperties
                }
              />
            ))}
          <div className="absolute inset-0 grid place-items-center">
            {image ? (
              <img src={image} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            ) : (
              <Icon className="h-14 w-14" style={{ color: m.color }} />
            )}
          </div>
        </div>
        <div className="mb-label">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {isBlank ? "" : t("chips.mystic_dropped")}
          </div>
          <div className="mt-1 text-xl font-bold" style={{ color: m.color }}>
            {m.label}
          </div>
          {rar && (
            <span
              className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
              style={{ background: rar.color + "22", color: rar.color }}
            >
              {rar.label}
            </span>
          )}
          {where && (
            <div className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {tavernReward && onViewMysticReward
                ? (ru ? "Награда хранится в Таверне." : "Your reward is in the Tavern.")
                : t(where.key)}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-gold py-2.5 text-sm font-bold text-background transition active:scale-95"
        >
          {t("chips.mystic_take")}
        </button>
        {tavernReward && onViewMysticReward ? (
          <button type="button" onClick={() => { onClose(); onViewMysticReward(tavernReward); }} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-border/60 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground active:scale-95">
            {ru ? "Посмотреть в Таверне" : "View in Tavern"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : where?.go && where.cta ? (
          <button
            onClick={() => {
              onClose();
              gotoChipsSub(where.go as ChipsSubTab);
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-border/60 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            {t(where.cta)}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
