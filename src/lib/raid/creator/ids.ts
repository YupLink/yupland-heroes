// Креатор (владелец, 07.11.2026): шаблоны поселений строятся на своих пустых
// картах. Карта работы — остров по id (isle_…: не active, вне сети порталов,
// без погоды), но со своей приставкой: режим бога креатора узнаёт её без
// запроса в базу — и на сервере, и в клиенте.
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";

export const CREATOR_PREFIX = `${ISLAND_PREFIX}cw_`;

export const isCreatorMapId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith(CREATOR_PREFIX);

/** Длина названия шаблона (как в базе: CHECK 1…60). */
export const CREATOR_NAME_MAX = 60;

/** Название шаблона: пробелы схлопнуты, края срезаны; пусто или длиннее 60 — null. */
export function cleanWorkName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= CREATOR_NAME_MAX ? name : null;
}

/** Имя нового мира по умолчанию: «Мир 3» — по числу своих миров. */
export const defaultWorldName = (own: number, lang: "ru" | "en"): string =>
  `${lang === "en" ? "World" : "Мир"} ${Math.max(0, Math.floor(own)) + 1}`;

/** Моя роль в мире: автор, правка вместе, только смотреть; null — админ смотрит чужой. */
export type CreatorRole = "owner" | "edit" | "view" | null;
/** Кому открыт мир и как. */
export type CreatorShare = { account: string; role: "view" | "edit" };

/** Работа в списке креатора. */
export type CreatorWork = {
  mapId: string;
  name: string;
  /** Моя работа (делиться, расширять и очищать может только автор). */
  mine: boolean;
  ownerAccount: string;
  /** Чья работа — подпись «автор: …». */
  ownerName: string;
  role: CreatorRole;
  /** Кому открыта и с какой ролью. */
  sharedWith: CreatorShare[];
  /** Рамка мира, клеток по стороне: 64, 128, 256, 512. */
  size: number;
  updatedAt: string | null;
};

/** Другой креатор — кому можно открыть работу. */
export type CreatorPeer = { account: string; name: string };

/** Креатор в каталоге: кто и его миры (портфолио). */
export type CreatorMember = {
  account: string;
  name: string;
  creator: boolean;
  works: CreatorWork[];
};

/** Размеры мира (владелец, 07.11.2026: «расширить с 64×64 до 128; 256; 512»). */
export const CREATOR_SIZES = [64, 128, 256, 512] as const;
export type CreatorSize = (typeof CREATOR_SIZES)[number];

/** Куда можно расширить мир этого размера: только больше. */
export const growSizes = (size: number): CreatorSize[] => CREATOR_SIZES.filter((s) => s > size);

/** Может ли моя роль править мир (админ правит любой). */
export const canEditWork = (w: Pick<CreatorWork, "role">, admin: boolean): boolean =>
  admin || w.role === "owner" || w.role === "edit";
