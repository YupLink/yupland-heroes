// Накладка «сломан» поверх картинки артефакта (владелец, 23.10.2026; ПРАВИЛА
// §8.63 п.3): «на нём сверху изображение, будто он сломан, поверх накладка».
// Затемнение, трещины и маленький значок поломки в углу — всё векторное, без
// новых растровых файлов.
//
// Рисует её ArtWearBar у сломанного (прочность 0) — значит, везде, где видна
// картинка артефакта с полосой: инвентарь, снаряжение героя, выбор для
// надевания, аукцион, подарки, ремонт. Только при запущенной механике
// (useArtBrokenOn: флаг запуска или админ); до запуска игроки видят всё как было.
//
// Родитель картинки обязан быть `relative` — тот же договор, что у полосы.
// Размеры SVG — в style: общие правила вида `.auction-lot__media svg` иначе
// сжали бы трещины до значка 24 × 24.
import { useArtBrokenOn } from "@/lib/hooks/useArtBroken";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FILL = { width: "100%", height: "100%" } as const;

/**
 * Значок поломки: красный кружок, расколотый надвое, — половинки разошлись по
 * зубчатому шву. Не зигзаг-молния: молния в игре — энергия.
 */
export function ArtBrokenBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 28 28" aria-hidden="true" className={className} style={FILL}>
      <g fill="currentColor" stroke="rgb(0 0 0 / 0.65)" strokeWidth={1.2} strokeLinejoin="round">
        <path
          d="M12 1A11 11 0 1 0 13 23L10.5 15.5 13.5 11 10 7Z"
          transform="translate(-1.4 -0.3) rotate(-8 12 12)"
        />
        <path
          d="M12 1A11 11 0 0 1 13 23L10.5 15.5 13.5 11 10 7Z"
          transform="translate(1.4 0.3) rotate(8 12 12)"
        />
      </g>
    </svg>
  );
}

// Трещины по картинке: главная сверху вниз и три ветки. Два слоя — тёмная
// подложка шире и светлая линия сверху; толщина не растягивается с картинкой.
const CRACKS = [
  "M30 0 38 17 31 30 47 46 41 58 58 72 54 86 63 100",
  "M47 46 62 40 74 45 100 35",
  "M41 58 26 66 13 63 0 72",
  "M58 72 72 79 79 93",
  "M31 30 17 23",
] as const;

/**
 * Сама накладка — без проверки флага (плашка над героем рисует её всегда).
 * shade — сила затемнения: на крошечной иконке плашки арт должен узнаваться.
 * Значок — в правом нижнем углу над полосой: левый верх и правый верх у плиток
 * заняты редкостью, характеристикой и счётчиком «×N».
 */
export function ArtBrokenOverlay({
  className,
  shade = "bg-black/50",
}: {
  className?: string;
  shade?: string;
}) {
  const en = useLang() === "en";
  return (
    <span
      role="img"
      aria-label={en ? "Broken" : "Сломан"}
      data-art-broken
      className={cn(
        "pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit]",
        className,
      )}
    >
      <span className={cn("absolute inset-0 block", shade)} />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="absolute inset-0"
        style={FILL}
      >
        {CRACKS.map((d) => (
          <path
            key={`u${d}`}
            d={d}
            stroke="rgb(0 0 0 / 0.7)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {CRACKS.map((d) => (
          <path
            key={`l${d}`}
            d={d}
            stroke="rgb(255 255 255 / 0.82)"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span className="absolute bottom-[9%] right-[5%] block aspect-square w-[40%] min-w-3 max-w-[22px] text-destructive">
        <ArtBrokenBadge />
      </span>
    </span>
  );
}

/** Накладка у сломанного — только когда механика поломки запущена. */
export function ArtBrokenMark({ className }: { className?: string }) {
  return useArtBrokenOn() ? <ArtBrokenOverlay className={className} /> : null;
}
