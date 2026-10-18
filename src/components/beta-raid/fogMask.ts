// Разведанное — битовая маска по номерам клеток, а не набор строк.
//
// Набор из 78 тысяч ключей «q,r» весил мегабайты и копировался целиком на
// каждый шаг героя (React хотел новую ссылку) — 30–60 мс на шаг у активного
// игрока. Здесь один байт на клетку (82 КБ), добавление — запись байта, а
// «новая ссылка» для React — лёгкая обёртка FogView с номером версии.
//
// Маска привязана к сетке карты (mapStore.geom): номер клетки → бит. Когда
// приходит другая сетка (расширили карту, другая карта), маска перекладывается
// по координатам. Для старого кода, которому нужны строки, есть перебор
// ключей и has(key) — но горячие места ходят по номерам.
import type { MapStore } from "./mapStore";
import { hexDistance } from "./hexGeometry";
import { bitAt } from "@/lib/raid/cellOrder";

export type Bounds = { minQ: number; maxQ: number; minR: number; maxR: number } | null;

/** То, что раньше было Set<string>: has, size и перебор ключей. */
export type KeySet = { has(key: string): boolean; readonly size: number } & Iterable<string>;

export class FogMask implements Iterable<string> {
  store: MapStore;
  private bits: Uint8Array;
  private count = 0;
  /** Растёт на каждое добавление — по нему React понимает, что есть новое. */
  version = 0;
  /** Журнал добавленных номеров: миникарта и синхронизация читают только новое. */
  readonly log: number[] = [];
  private box: Bounds = null;

  constructor(store: MapStore) {
    this.store = store;
    this.bits = new Uint8Array(store.n);
  }

  get size(): number {
    return this.count;
  }

  get bounds(): Bounds {
    return this.box;
  }

  /** Разведана и не под куполом: игроку клетка под глухим туманом не видна. */
  hasIndex(i: number): boolean {
    return i >= 0 && this.bits[i] === 1 && !this.store.dome.has(i);
  }

  /** Бит как есть — для записи на устройство и синхронизации с сервером. */
  rawIndex(i: number): boolean {
    return i >= 0 && this.bits[i] === 1;
  }

  has(key: string): boolean {
    return this.hasIndex(this.store.indexOfKey(key));
  }

  addIndex(i: number): boolean {
    if (i < 0 || i >= this.bits.length || this.bits[i] === 1) return false;
    this.bits[i] = 1;
    this.count++;
    this.log.push(i);
    const q = this.store.packed.q[i];
    const r = this.store.packed.r[i];
    const b = this.box;
    if (!b) this.box = { minQ: q, maxQ: q, minR: r, maxR: r };
    else {
      if (q < b.minQ) b.minQ = q;
      if (q > b.maxQ) b.maxQ = q;
      if (r < b.minR) b.minR = r;
      if (r > b.maxR) b.maxR = r;
    }
    return true;
  }

  add(key: string): boolean {
    return this.addIndex(this.store.indexOfKey(key));
  }

  /** Все клетки в радиусе вокруг точки; возвращает, сколько добавилось. */
  addDisc(q0: number, r0: number, radius: number): number {
    let added = 0;
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (hexDistance(q0, r0, q0 + dq, r0 + dr) > radius) continue;
        if (this.addIndex(this.store.index(q0 + dq, r0 + dr))) added++;
      }
    }
    return added;
  }

  addMany(keys: Iterable<string>): number {
    let added = 0;
    for (const k of keys) if (this.add(k)) added++;
    return added;
  }

  /** Биты по номерам клеток ЭТОЙ сетки (порядок проверяет вызывающий). */
  addBits(packed: Uint8Array): number {
    let added = 0;
    const n = Math.min(this.bits.length, packed.length << 3);
    for (let i = 0; i < n; i++) if (bitAt(packed, i) && this.addIndex(i)) added++;
    return added;
  }

  /** Та же маска на новой карте: та же сетка — как есть, иная — по координатам. */
  rebind(store: MapStore): FogMask {
    if (store.geom === this.store.geom) {
      this.store = store;
      return this;
    }
    const next = new FogMask(store);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i] === 1)
        next.addIndex(store.index(this.store.packed.q[i], this.store.packed.r[i]));
    }
    next.version = this.version + 1;
    return next;
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.bits.length; i++) if (this.hasIndex(i)) yield this.store.key(i);
  }

  /** Номера клеток, добавленные после позиции журнала `from`. */
  addedSince(from: number): number[] {
    return from >= this.log.length ? [] : this.log.slice(from);
  }

  keyOf(i: number): string {
    return this.store.key(i);
  }

  toKeys(): string[] {
    return [...this];
  }
}

/**
 * Снимок маски для React: одна и та же маска, новый номер версии. Кадр и
 * memo просыпаются на новую ссылку, а копировать нечего.
 */
export type FogView = KeySet & {
  readonly mask: FogMask;
  readonly version: number;
  hasIndex(i: number): boolean;
};

export function fogView(mask: FogMask): FogView {
  return {
    mask,
    version: mask.version,
    has: (key) => mask.has(key),
    hasIndex: (i) => mask.hasIndex(i),
    get size() {
      return mask.size;
    },
    [Symbol.iterator]: () => mask[Symbol.iterator](),
  };
}
