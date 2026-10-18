// Значок вида награды — общий для всех мест, где показываем призы.
//
// Текстом («лайки 25 · энергия 50 · пак») строка не влезала в мобильную
// ширину, а эмодзи выглядят дёшево. Один источник иконок и цветов, чтобы
// «энергия» была одного цвета в окне боя, в таблице мест и в раскладе наград.
import { Boxes, Coins, Gem, Heart, Mountain, Package, Sparkles, TreePine, Zap } from "lucide-react";
import { rewardKindImage } from "./rewardKinds";

const PRIZE_ICON: Record<string, { Icon: typeof Zap; color: string }> = {
  energy: { Icon: Zap, color: "#f5b301" },
  likes: { Icon: Heart, color: "#ff5470" },
  pack: { Icon: Package, color: "#4fd6e0" },
  item: { Icon: Sparkles, color: "#b46bff" },
  // Ресурсы счёта: сервер кладёт в kind сам код (gold/stone/…), поэтому здесь
  // они лежат рядом с остальными видами. Спрайт — в prizeImage, эти иконки
  // остаются запасным вариантом, пока картинка не загрузилась.
  gold: { Icon: Coins, color: "#f5c542" },
  stone: { Icon: Mountain, color: "#9aa4b2" },
  wood: { Icon: TreePine, color: "#b07a46" },
  diamonds: { Icon: Gem, color: "#5ad2ff" },
  resource: { Icon: Coins, color: "#f5c542" },
  custom: { Icon: Boxes, color: "#c084fc" },
};

/** Иконка + цвет для вида награды; неизвестное (токены) — монета. */
export function prizeIcon(kind: string): { Icon: typeof Zap; color: string } {
  return PRIZE_ICON[kind] ?? { Icon: Coins, color: "#37d67a" };
}

/**
 * Картинка вида награды: у ресурсов есть готовый спрайт, и он читается лучше
 * абстрактной иконки. Не ресурс — null, вызывающий рисует prizeIcon.
 */
export function prizeImage(kind: string, ref?: string | null): string | null {
  return rewardKindImage(kind, ref);
}
