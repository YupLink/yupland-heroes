// Состояния шахт v2 от Ангелины (набор 23.10.2026, «Шахты — дополнительные
// состояния 2»): «разрушено», «можно поставить» (зелёная), «нельзя поставить»
// (красная) и взрыв — для лесопилки, каменной, золотой и алмазной шахт.
//
// Файлы — public/raid/mines/. Как собраны из PNG 1024 и GIF 512 набора:
//  · кадр картинки = кадр ОБЫЧНОЙ картинки этой шахты в игре (тот же файл, что
//    в «Оригиналах из игрового архива» набора: /uploads/tasks/… шаблона),
//    рисунок набора совмещён с ней по силуэту; кадр расширен на MINE_ART_PAD_X
//    ширины с каждого бока, MINE_ART_PAD_B снизу и MINE_ART_PAD_T сверху — чтобы
//    влезли обломки, обводка и тряска взрыва. Рисуется прямоугольником постройки
//    (центр, низ на гексе, ширина R·1,7), расширенным на те же доли
//    (mineArtRect): масштаб и опорная точка — как у обычной шахты;
//  · у GIF алмазной шахты кадры 1–6 были на чёрном фоне (README: «на прозрачном
//    фоне») — чистый #000 вне силуэта здания снят в прозрачность, рисунок не тронут;
//  · PNG → webp 256 px; красная и зелёная уже полупрозрачны (~50 %) — рисуем
//    без своей прозрачности;
//  · GIF → лист кадров MINE_BLAST_COLS × MINE_BLAST_ROWS по 160 px, пустой
//    последний кадр не кладём; длительности — из GIF (MINE_BLAST_FRAME_MS).
// Качаются по требованию кадра: MAP_PRELOAD без eager → LazyImages (§9.1.6).

/** Виды шахт набора — ресурс шахты v2 (как PlaceableBlueprint). */
export const MINE_ART_KINDS = ["wood", "stone", "gold", "diamonds"] as const;
export type MineArtKind = (typeof MINE_ART_KINDS)[number];

export type MineArtState = "destroyed" | "can-place" | "cannot-place";
const STATES: readonly MineArtState[] = ["destroyed", "can-place", "cannot-place"];

/** Имя файла набора по виду шахты. */
const FILE: Record<MineArtKind, string> = {
  wood: "sawmill",
  stone: "stone-mine",
  gold: "gold-mine",
  diamonds: "diamond-mine",
};

/** Поля кадра: доля ширины обычной картинки с каждого бока, снизу и сверху. */
export const MINE_ART_PAD_X = 0.04;
export const MINE_ART_PAD_B = 0.01;
export const MINE_ART_PAD_T = 0.015;

export const mineArtSrc = (kind: MineArtKind, state: MineArtState): string =>
  `/raid/mines/${FILE[kind]}-${state}.webp`;
/** Ключ картинки состояния в кэше картинок карты. */
export const mineArtKey = (kind: MineArtKind, state: MineArtState): string =>
  `mine-${state}:${kind}`;

export const mineBlastSrc = (kind: MineArtKind): string =>
  `/raid/mines/${FILE[kind]}-explosion.webp`;
/** Ключ листа кадров взрыва в кэше картинок карты. */
export const mineBlastKey = (kind: MineArtKind): string => `mine-blast:${kind}`;

/** Лист взрыва: столбцы × ряды кадров одного размера. */
export const MINE_BLAST_COLS = 5;
export const MINE_BLAST_ROWS = 2;
/** Длительности непустых кадров, мс — как в GIF набора (11-й, пустой, не рисуем). */
export const MINE_BLAST_FRAME_MS: readonly number[] = [120, 60, 60, 60, 70, 70, 80, 80, 80, 70];
/** Весь взрыв, мс: после него не рисуется ничего. */
export const MINE_BLAST_MS = MINE_BLAST_FRAME_MS.reduce((a, b) => a + b, 0);

/** Номер кадра через t мс от начала; -1 — взрыв проигран (или ещё не начат). */
export function mineBlastFrameAt(t: number): number {
  if (!(t >= 0)) return -1;
  let end = 0;
  for (let i = 0; i < MINE_BLAST_FRAME_MS.length; i++) {
    end += MINE_BLAST_FRAME_MS[i];
    if (t < end) return i;
  }
  return -1;
}

/** Через сколько мс сменится кадр (или взрыв кончится); null — уже проигран. */
export function mineBlastNextIn(t: number): number | null {
  if (!(t >= 0)) return null;
  let end = 0;
  for (const ms of MINE_BLAST_FRAME_MS) {
    end += ms;
    if (t < end) return end - t;
  }
  return null;
}

/** Вид шахты из события: ресурс шахты или имя файла набора; чужое — null. */
const ALIASES: Record<string, MineArtKind> = {
  wood: "wood",
  sawmill: "wood",
  stone: "stone",
  "stone-mine": "stone",
  gold: "gold",
  "gold-mine": "gold",
  diamonds: "diamonds",
  diamond: "diamonds",
  "diamond-mine": "diamonds",
};
export function mineArtKindOf(raw: unknown): MineArtKind | null {
  return typeof raw === "string" ? (ALIASES[raw.trim().toLowerCase()] ?? null) : null;
}

/** Картинки набора для кэша карты (useImageCache через MAP_PRELOAD) — не eager. */
export const MINE_ART_PRELOAD: ReadonlyArray<{ key: string; src: string }> = MINE_ART_KINDS.flatMap(
  (kind) => [
    ...STATES.map((state) => ({ key: mineArtKey(kind, state), src: mineArtSrc(kind, state) })),
    { key: mineBlastKey(kind), src: mineBlastSrc(kind) },
  ],
);
