// Справочник параметров игры: формат записей.
//
// Текст пишется сразу на двух языках парой [ru, en] — справочник открытый и
// живёт вне словарей интерфейса: так запись видна целиком в одном месте.
import type { LucideIcon } from "lucide-react";

/** Текст на двух языках: [русский, английский]. */
export type L = readonly [ru: string, en: string];

/** Значок записи: значок интерфейса с цветом или картинка из игры. */
export type GuideIcon = { Icon: LucideIcon; color: string } | { src: string };

/** Небольшая таблица чисел (редкость, фишки по звёздам…). */
export type GuideTable = {
  cols: readonly L[];
  rows: ReadonlyArray<ReadonlyArray<string | L>>;
};

export type GuideEntry = {
  id: string;
  icon?: GuideIcon;
  name: L;
  /** Что это и как работает — коротко. */
  what: L;
  /** Где в игре это важно. */
  where?: L;
  table?: GuideTable;
};

export type GuideSection = {
  id: string;
  title: L;
  entries: readonly GuideEntry[];
};

export type GuideLang = "ru" | "en";

export const pick = (text: L, lang: GuideLang): string => (lang === "en" ? text[1] : text[0]);
