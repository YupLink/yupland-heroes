// Правка колонок карты с ленивым клоном: копируется только то, чего коснулись.
//
// Раньше каждый мазок кистью клонировал ВСЕ колонки — семь массивов по 16 384
// числа плюс пять словарей, — хотя правка меняет одну ячейку в одной колонке.
// Дело не только в самой копии: новые массивы рвут ссылки, и по ним экран
// пересобирал карту целиком (unpackCells → buildMapIndex → тайлы → миникарта).
// Здесь неизменные колонки остаются ТЕМИ ЖЕ массивами, и всё, что ниже по
// течению, узнаёт их по ссылке и переиспользует свою работу.
import type { PackedCells } from "./unpackMap";
import { attachCellIndex, cellIndex } from "./cellIndex";

/** Числовые колонки клеток. */
type NumCol = "q" | "r" | "t" | "road" | "obj" | "dec" | "bld";
/** Списки индексов: «добыт», «под куполом», «беглец», блоки — списком. */
type ListCol = "defeated" | "voidFog" | "runners" | "groups";
/** Словари id: кисть дописывает в них свежепоставленные ассеты (и блоки). */
export type PoolName =
  | "terrainIds"
  | "roadIds"
  | "objectIds"
  | "decorationIds"
  | "buildingIds"
  | "groupIds";

export class PackedEdit {
  private readonly src: PackedCells;
  private readonly out: PackedCells;
  /** Что уже склонировано: второй раз тот же массив не копируем. */
  private readonly copied = new Set<string>();
  private index: Map<string, number>;
  /** Индекс пока общий с исходником — копируем перед первой новой клеткой. */
  private ownIndex = false;
  private dirty = false;

  constructor(src: PackedCells) {
    this.src = src;
    // Верхний объект — мелкий: тринадцать ссылок, сами массивы остаются общими.
    this.out = {
      ...src,
      voidFog: src.voidFog ?? [],
      runners: src.runners ?? [],
      groups: src.groups ?? [],
      groupIds: src.groupIds ?? [],
    };
    // Карта из старого суточного кэша приезжает без части колонок. Раз мы их
    // тут завели — отдавать надо новые колонки, иначе окно клетки так и будет
    // считать, что карта про купол не знает вовсе (useAdminCellView).
    if (!src.voidFog || !src.runners || !src.groups || !src.groupIds) this.dirty = true;
    this.index = cellIndex(src);
  }

  /** Номер строки клетки; undefined — такой клетки в карте ещё нет. */
  rowOf(key: string): number | undefined {
    return this.index.get(key);
  }

  /** Колонка на запись: клонируется при первом касании. */
  col(name: NumCol): number[] {
    if (!this.copied.has(name)) {
      this.copied.add(name);
      this.dirty = true;
      this.out[name] = [...this.src[name]];
    }
    return this.out[name];
  }

  /** Что сейчас в колонке (с учётом уже сделанных правок). */
  read(name: NumCol, i: number): number {
    return this.out[name][i] ?? -1;
  }

  /** Индекс id в словаре; нет — дописываем, и только тогда копируем словарь. */
  poolIndex(name: PoolName, id: string | null | undefined): number {
    if (!id) return -1;
    const cur = this.out[name] ?? [];
    const at = cur.indexOf(id);
    if (at >= 0) return at;
    this.copied.add(name);
    this.dirty = true;
    const pool = [...cur, id];
    this.out[name] = pool;
    return pool.length - 1;
  }

  /** id по индексу словаря; -1 — «пусто». */
  idAt(name: PoolName, at: number): string | null {
    return at >= 0 ? (this.out[name]?.[at] ?? null) : null;
  }

  /** Переписать список индексов — только если он и правда изменился. */
  setList(name: ListCol, values: number[]): void {
    this.dirty = true;
    this.out[name] = values;
  }

  /** Завести клетку, которой в карте не было; вернуть её номер строки. */
  addRow(key: string, q: number, r: number): number {
    // Индекс до этого был общим с прошлыми колонками — портить его нельзя.
    if (!this.ownIndex) {
      this.index = new Map(this.index);
      this.ownIndex = true;
    }
    const i = this.col("q").length;
    this.col("q").push(q);
    this.col("r").push(r);
    this.col("t").push(-1);
    this.col("road").push(-1);
    this.col("obj").push(-1);
    this.col("dec").push(-1);
    this.col("bld").push(-1);
    this.index.set(key, i);
    return i;
  }

  /**
   * Готовые колонки. Ничего не тронуто (правка была только про тир постройки) —
   * отдаём исходник: новая ссылка packed заставила бы экран пересобрать карту
   * впустую.
   */
  finish(): PackedCells {
    if (!this.dirty) return this.src;
    attachCellIndex(this.out, this.index);
    return this.out;
  }
}
