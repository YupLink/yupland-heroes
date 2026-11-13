// Как выглядит приз мистического бокса: подпись, значок, цвет, редкость и
// КУДА его положили. Общее у окна одного приза (MysticPrizeReveal) и окна
// пачки Bonus Box (MysticBatchReveal).
import {
  Sparkles,
  Gem,
  Crown,
  Package,
  Zap,
  Heart,
  Pickaxe,
  ShoppingBag,
  Coins,
} from "lucide-react";
import type { useT } from "@/lib/i18n";
import type { ChipsSubTab } from "@/lib/chipsNav";
import { heroRarity } from "@/components/heroMeta";
import type { MysticPrize } from "@/server/api/mystic";
import { rewardKindImage, rewardKindLabelKey, rewardShownAmount } from "@/lib/rewardKinds";

type T = ReturnType<typeof useT>;

const ART_RARITY: Record<string, { key: string; color: string }> = {
  common: { key: "chips.rarity_common", color: "#9aa4bd" },
  rare: { key: "chips.rarity_rare", color: "#5b9bff" },
  epic: { key: "chips.rarity_epic", color: "#b46bff" },
  legendary: { key: "chips.rarity_legendary", color: "#f5c451" },
};

export type MysticWhere = { key: string; go?: ChipsSubTab; cta?: string };

/** Куда положили приз и как туда попасть. */
export function whereOf(kind: string): MysticWhere | null {
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

/** Подсказка «куда положили»; в замке герой/артефакт — в Таверне. */
export function whereText(prize: MysticPrize, t: T, ru: boolean, inCastle: boolean): string | null {
  const where = whereOf(prize.kind);
  if (!where) return null;
  if ((prize.kind === "hero" || prize.kind === "artifact") && inCastle)
    return ru ? "Награда хранится в Таверне." : "Your reward is in the Tavern.";
  return t(where.key);
}

export function mysticPrizeView(prize: MysticPrize, t: T) {
  const meta: Record<string, { label: string; icon: typeof Package; color: string }> = {
    pack: { label: prize.name || t("chips.prize_pack"), icon: Package, color: "#a78bfa" },
    // Приз «билеты» выдаётся золотом ×100 (ПРАВИЛА §8.61).
    tickets: {
      label: t("chips.prize_tickets", { n: rewardShownAmount("tickets", prize.amount ?? 0) }),
      icon: Coins,
      color: "#f5c451",
    },
    energy: {
      label: t("chips.prize_energy", { n: prize.amount ?? 0 }),
      icon: Zap,
      color: "#41d3c6",
    },
    artifact: { label: prize.name || t("chips.prize_artifact"), icon: Gem, color: "#ff7be0" },
    hero: { label: prize.name || t("chips.prize_hero"), icon: Crown, color: "#ff6b6b" },
    likes: {
      label: t("chips.prize_likes", { n: prize.amount ?? 0 }),
      icon: Heart,
      color: "#fb7185",
    },
    resource: {
      label: t("chips.prize_amount", {
        n: prize.amount ?? 0,
        what: t(rewardKindLabelKey("resource", prize.code) ?? "braid.rw_custom"),
      }),
      icon: Pickaxe,
      color: "#c9a26b",
    },
    custom: {
      label: t("chips.prize_amount", {
        n: prize.amount ?? 1,
        what: prize.name || t("braid.rw_custom"),
      }),
      icon: ShoppingBag,
      color: "#f59e0b",
    },
    token: {
      label: `${prize.amount ?? 0} ${prize.code === "Darai" ? "DARAI" : prize.code === "STARS" ? "⭐" : (prize.code ?? "")}`,
      icon: Coins,
      color: "#34d399",
    },
    blank: { label: t("chips.mystic_blank"), icon: Sparkles, color: "#9aa4bd" },
  };
  const m = meta[prize.kind] ?? meta.blank;
  // Ресурсу — его спрайт, если своей картинки у приза нет.
  const image = prize.image ?? (prize.kind === "resource" ? rewardKindImage(prize.code) : null);
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
  return { label: m.label, Icon: m.icon, color: m.color, image, rar, where: whereOf(prize.kind) };
}

/** Анимации окна приза — одни на одиночное окно и окно пачки. */
export const MB_REVEAL_CSS = `
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
`;
