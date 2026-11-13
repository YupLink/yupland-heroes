// Значок и оттенок вида награды промокода — один на карточку игрока, сетку
// видов и список кодов админа: «босс» везде одного цвета.
import {
  Ban,
  Coins,
  Gem,
  Gift,
  Heart,
  Package,
  Pickaxe,
  Shield,
  Skull,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PromoKind } from "@/lib/promo/promoTypes";

export const PROMO_KIND_ICON: Record<PromoKind, { Icon: LucideIcon; tint: string }> = {
  token: { Icon: Coins, tint: "text-neon" },
  resource: { Icon: Pickaxe, tint: "text-amber-300" },
  custom: { Icon: Package, tint: "text-emerald-300" },
  pack: { Icon: Gift, tint: "text-gold" },
  art: { Icon: Gem, tint: "text-fuchsia-300" },
  hero: { Icon: Shield, tint: "text-sky-300" },
  boss: { Icon: Skull, tint: "text-orange-300" },
  energy: { Icon: Zap, tint: "text-gold" },
  likes: { Icon: Heart, tint: "text-rose-400" },
  nothing: { Icon: Ban, tint: "text-muted-foreground" },
};
