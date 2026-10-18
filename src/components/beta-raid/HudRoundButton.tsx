// Круглая кнопка HUD с бейджем-счётчиком — общая для «Добычи» и «Подарков».
//
// Обе кнопки живут под мини-картой и подчиняются одному правилу: цифра
// появляется, только когда есть что забрать. Ноль не рисуем вовсе — пустой
// кружок на карте не должен просить внимания.
//
// Значок — картинка из public (HUD_ART): золотой контур со своим ободком на
// прозрачном фоне. Отсюда чёрная подложка: над песком, снегом и травой тонкая
// золотая линия иначе теряется. Второй бордюр кнопке не нужен — ободок уже
// нарисован в самой картинке, рамка дала бы двойное кольцо.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AuctionCount } from "@/components/chips/auctions/AuctionCount";

export function HudRoundButton({
  art,
  icon,
  count = 0,
  label,
  tone = "gold",
  pulse = false,
  hud,
  onClick,
}: {
  /** Путь к картинке значка — берётся из HUD_ART (src/lib/gameArt.ts). */
  art?: string;
  /** Значок как иконка (для кнопок без готовой картинки, напр. аукцион). */
  icon?: ReactNode;
  /** Сколько наград ждёт. 0 — бейджа нет. */
  count?: number;
  label: string;
  /** Цвет бейджа: золотой — добыча, розовый — подарок, camp — как счётчик лагеря. */
  tone?: "gold" | "gift" | "camp";
  /** Подарок ещё не забран — кнопка мягко пульсирует. */
  pulse?: boolean;
  /** Метка для подсветки подсказок (data-hud), например «harvest». */
  hud?: string;
  onClick: () => void;
}) {
  const n = Math.max(0, Math.floor(count));
  return (
    <button
      type="button"
      onClick={onClick}
      data-hud={hud}
      aria-label={label}
      title={label}
      className={cn(
        "pointer-events-auto relative grid h-11 w-11 place-items-center rounded-full bg-black shadow-lg transition active:scale-95",
        pulse && n > 0 && "animate-pulse",
      )}
    >
      {icon ? (
        <span className="grid h-full w-full place-items-center text-gold">{icon}</span>
      ) : (
        <img
          src={art}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-contain"
        />
      )}
      {tone === "camp" && <AuctionCount n={n} />}
      {tone !== "camp" && n > 0 && (
        <span
          className={cn(
            "absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full border border-background px-1 text-[10px] font-extrabold leading-tight",
            tone === "gift" ? "bg-pink-400 text-black" : "bg-gold text-gold-foreground",
          )}
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </button>
  );
}
