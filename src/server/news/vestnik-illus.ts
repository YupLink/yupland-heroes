// Главная картинка «Вестника» — пейзаж из сцен игры (природа, погода), без ИИ:
// владелец 29.10.2026 — картинки ИИ «тупые», «только природа».
import { C, h, img, INNER, type El } from "./vestnik-ui";
import { pic } from "./vestnik-images";

/** Пейзажи — все сцены метеостанции (public/weather-station/scenes). */
const BANDS: Record<string, string[]> = {
  very_cold: ["blizzard", "clear", "fog", "overcast", "storm"],
  cold: ["blizzard", "clear", "fog", "overcast", "storm"],
  cool: ["blizzard", "clear", "fog", "overcast", "rain", "storm"],
  warm: ["clear", "fog", "overcast", "rain", "storm", "thunderstorm"],
  hot: ["clear", "fog", "overcast", "rain", "storm", "thunderstorm"],
};
export const FALLBACK_SCENES = Object.entries(BANDS).flatMap(([band, kinds]) =>
  kinds.map((k) => `/weather-station/scenes/${band}/${k}.webp`),
);

/** Пейзаж дня: по дате, чтобы соседние выпуски не повторялись. */
export function sceneFor(date: string, variant = 0): string {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const i =
    ((Number.isFinite(day) ? Math.abs(day) : 0) + Math.max(0, variant)) % FALLBACK_SCENES.length;
  return FALLBACK_SCENES[i];
}

const frame = (height: number, ...children: Array<El | null>): El =>
  h(
    "div",
    {
      marginTop: 14,
      flexShrink: 0,
      height,
      // Рамка 1px прибавляется к ширине (у satori поля и рамка — снаружи).
      width: INNER - 2,
      border: `1px solid ${C.ink}`,
      justifyContent: "center",
      alignItems: "flex-end",
      overflow: "hidden",
      backgroundImage: "linear-gradient(180deg, #ece5d6 0%, #efe9dc 70%, #ddd3bd 100%)",
    },
    ...children,
  );

/**
 * Главная картинка выпуска — пейзаж из сцен метеостанции (природа и погода),
 * свой на каждый день; «Сгенерировать заново» листает следующий.
 */
export async function landscape(date: string, height: number, variant = 0): Promise<El> {
  const scene = await pic(sceneFor(date, variant), INNER - 2, height - 2, "cover");
  return frame(height, scene ? img(scene) : null);
}
