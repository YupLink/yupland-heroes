// Общие типы/мета видов призов мистического бокса — для инвентаря (Фишки →
// Паки) и админ-конструктора. Список видов — lib/mysticKinds.ts.
import {
  Package,
  Ticket,
  Zap,
  Image as ImageIcon,
  Gem,
  Crown,
  Heart,
  Pickaxe,
  ShoppingBag,
  Coins,
} from "lucide-react";
import { RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { amountRangeText, type MysticKind } from "@/lib/mysticKinds";

export type { MysticKind };

export type MysticTier = {
  kind: MysticKind;
  weight: number;
  label?: string;
  packId?: string;
  amountMin?: number;
  amountMax?: number;
  token?: string;
  resource?: "gold" | "stone" | "wood" | "diamonds";
  customId?: string;
  customName?: string;
  nftTitle?: string;
  nftContract?: string;
  // artifact/hero — выбор из СОЗДАННЫХ (mystic_item_template)
  itemTemplateId?: string;
  itemName?: string;
  // legacy (демо-боксы до перехода на шаблоны)
  artifactRarity?: "common" | "rare" | "epic" | "legendary";
  heroMinLevel?: number;
};

export const KIND_META: Record<MysticKind, { label: string; icon: typeof Package; color: string }> = {
  pack: { label: "Пак / бокс", icon: Package, color: "#a78bfa" },
  artifact: { label: "Артефакт", icon: Gem, color: "#ff7be0" },
  hero: { label: "Герой", icon: Crown, color: "#ff6b6b" },
  custom: { label: "Товар", icon: ShoppingBag, color: "#f59e0b" },
  resource: { label: "Ресурс", icon: Pickaxe, color: "#c9a26b" },
  token: { label: "Токен", icon: Coins, color: "#34d399" },
  tickets: { label: "Билеты", icon: Ticket, color: "#f5c451" },
  energy: { label: "Энергия", icon: Zap, color: "#41d3c6" },
  likes: { label: "Лайки", icon: Heart, color: "#fb7185" },
  nft: { label: "NFT", icon: ImageIcon, color: "#7fb3ff" },
  ft: { label: "FT", icon: Coins, color: "#7fb3ff" },
};

export function tierSummary(t: MysticTier): string {
  if (t.label) return t.label;
  const n = amountRangeText(t.amountMin, t.amountMax) || "?";
  switch (t.kind) {
    case "pack":
      return `Пак ${t.packId || "—"}`;
    case "tickets":
      return `${n} билетов`;
    case "energy":
      return `${n} энергии`;
    case "likes":
      return `${n} лайков`;
    case "resource":
      return `${n} ${t.resource ? RESOURCE_LABELS_RU[t.resource] : "ресурса"}`;
    case "custom":
      return `${n} × ${t.customName || t.customId || "товар"}`;
    case "token":
    case "ft":
      return `${n} ${t.token || ""}`.trim();
    case "nft":
      return t.nftTitle || "NFT";
    case "artifact":
      return t.itemName || `Артефакт (${t.artifactRarity || "?"})`;
    case "hero":
      return t.itemName || `Герой ${t.heroMinLevel ? t.heroMinLevel + "★+" : ""}`;
  }
}
