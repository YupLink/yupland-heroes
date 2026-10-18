// Маленькая иконка характеристики артефакта (щит/меч/…) + число. Показывается
// в правом-верхнем углу карточки — и в админке, и у юзера в инвентаре.
import {
  Shield,
  Sword,
  Zap,
  BookOpen,
  Heart,
  Wind,
  Sparkles,
  Droplet,
  Snail,
  Clover,
  Flame,
  Swords,
  Coins,
  FlaskConical,
} from "lucide-react";
import { metaLabel } from "@/components/heroMeta";

export function statMeta(stat: string | null | undefined): {
  Icon: typeof Shield;
  color: string;
} {
  switch ((stat ?? "").toLowerCase()) {
    case "armor":
      return { Icon: Shield, color: "#5b9bff" };
    case "attack":
    case "damage":
    case "strength":
      return { Icon: Sword, color: "#ff6b6b" };
    case "speed":
      return { Icon: Zap, color: "#41d3c6" };
    case "intellect":
      return { Icon: BookOpen, color: "#b46bff" };
    case "luck":
      return { Icon: Clover, color: "#6fcf6f" };
    case "health":
      return { Icon: Heart, color: "#6fcf6f" };
    case "agility":
      return { Icon: Wind, color: "#f5c451" };
    case "trade":
      return { Icon: Coins, color: "#f5c451" };
    case "alchemy":
      return { Icon: FlaskConical, color: "#b46bff" };
    default:
      return { Icon: Sparkles, color: "#ffb3c8" };
  }
}

export function StatBadge({
  stat,
  amount,
  className,
}: {
  stat: string | null | undefined;
  amount: number | null | undefined;
  className?: string;
}) {
  if (!stat) return null;
  const { Icon, color } = statMeta(stat);
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-0.5 text-[10px] font-extrabold " +
        (className ?? "")
      }
      style={{ color }}
      title={`${stat}${amount != null ? ` +${amount}` : ""}`}
    >
      <Icon className="h-3 w-3" />
      {amount != null ? `+${amount}` : ""}
    </span>
  );
}

// Иконка иммунитета (защита от эффекта босса): подобрана по смыслу и цвету.
//   Яд — зелёная капля · Оглушение — золотые «звёздочки» · Замедление —
//   голубая улитка · Выжигание энергии — оранжевое пламя · Удар по всем —
//   розовые мечи. Ключ — канон-значение (RU) из IMMUNITIES/BOSS_EFFECTS.
export function immunityMeta(name: string | null | undefined): {
  Icon: typeof Shield;
  color: string;
} {
  switch (name) {
    case "Яд":
      return { Icon: Droplet, color: "#4ade80" };
    case "Оглушение":
      return { Icon: Sparkles, color: "#fbbf24" };
    case "Замедление":
      return { Icon: Snail, color: "#38bdf8" };
    case "Выжигание энергии":
      return { Icon: Flame, color: "#fb923c" };
    case "Удар по всем":
      return { Icon: Swords, color: "#fb7185" };
    // Ослабление берёт значок САМОЙ характеристики — щит у брони, меч у атаки:
    // игрок узнаёт их по карточкам артефактов, а падение показывает стрелка
    // вниз рядом со значком (BetaEffectHud). Общая «стрелка вниз» на всё
    // четыре ничего не говорила: «−20 чего?».
    case "Ослабление: атака":
      return { Icon: Sword, color: "#ff6b6b" };
    case "Ослабление: броня":
      return { Icon: Shield, color: "#5b9bff" };
    case "Ослабление: удача":
      return { Icon: Clover, color: "#6fcf6f" };
    case "Ослабление: интеллект":
      return { Icon: BookOpen, color: "#b46bff" };
    default:
      return { Icon: Shield, color: "#9aa4bd" };
  }
}

/** Ряд иконок иммунитетов (снизу карточки артефакта). Пусто → null. */
export function ImmunityBadges({
  immunities,
  lang,
  className,
}: {
  immunities: string[] | null | undefined;
  lang: string;
  className?: string;
}) {
  const list = (immunities ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <span className={"inline-flex items-center gap-1 " + (className ?? "")}>
      {list.map((im) => {
        const { Icon, color } = immunityMeta(im);
        return (
          <span
            key={im}
            className="grid h-4 w-4 place-items-center rounded-full bg-black/70"
            style={{ color }}
            title={metaLabel(im, lang)}
          >
            <Icon className="h-2.5 w-2.5" />
          </span>
        );
      })}
    </span>
  );
}
