// Типы редактора интерьера замка: слои, ассеты, клетки.
import {
  CASTLE_KINDS,
  EMPTY_CASTLE_CELL,
  castleCellHasContent,
  type CastleCell,
  type CastleKind,
} from "@/lib/castleKinds";

export { CASTLE_KINDS };
export type { CastleCell, CastleKind };

export type Asset = {
  id: string;
  kind: string;
  name: string;
  image_url: string | null;
  label_font_size?: number | null;
  menu_action?: import("@/lib/castleMenus").Destination | null;
};

export type CellMap = Record<string, CastleCell>;

/** Подпись слоя во вкладках палитры и в модалке. */
export const KIND_LABEL: Record<CastleKind, string> = {
  terrain: "Местность",
  building: "Постройки",
  object: "Объекты",
  decoration: "Декор",
  road: "Дороги",
};

/** Единственное число — для заголовка «Новая постройка». */
export const KIND_ONE: Record<CastleKind, string> = {
  terrain: "тип местности",
  building: "постройку",
  object: "объект",
  decoration: "декор",
  road: "дорогу",
};

/** Слой → поле клетки, куда пишется id ассета. */
export const LAYER_FIELD: Record<CastleKind, keyof Omit<CastleCell, "groupId" | "iconScale">> = {
  terrain: "terrainId",
  building: "buildingId",
  object: "objectId",
  decoration: "decorationId",
  road: "roadId",
};

export const EMPTY_CELL: CastleCell = EMPTY_CASTLE_CELL;

/** Есть ли в клетке хоть что-то (иначе её незачем хранить). */
export const cellHasContent = castleCellHasContent;

/** Кисть: слой + ассет. null-ассет = ластик этого слоя.
 *  Кисть может быть и не выбрана вовсе (null) — тогда клик по клетке ничего
 *  не делает: смена вкладки не должна молча взводить ластик. */
export type Brush = { kind: CastleKind; assetId: string | null };
