// Дуэль героев (концепт Ярослава 29.10.2026, «как в третьих Героях»): поле 12×8
// (было 16 — Ярослав 08.11: «16 многовато, листать приходится, давайте 12»), герой и
// до 4 мобов на сторону, ходы по очереди. Пока песочница админов.

export const COLS = 12;
export const ROWS = 8;

export type Side = "a" | "b";
export type Pos = { c: number; r: number };

export type Unit = {
  id: string;
  side: Side;
  kind: "hero" | "mob";
  name: string;
  image: string | null;
  /** Фигурка героя — атлас бега с карты (у мобов нет: рисуется image). */
  atlas?: string | null;
  /** Жизни: у героя — сытость, у моба — жизни шаблона. */
  hp: number;
  maxHp: number;
  /** Урон удара: у моба — диапазон шаблона, у героя — атака × правило. */
  dmg: [number, number];
  /** Броня (только у героя): режет входящий урон. */
  arm: number;
  /** На сколько клеток уходит за ход. */
  move: number;
  /** Дальность удара в клетках: 1 — вплотную, 2 и больше — стреляет так далеко. */
  range: number;
  pos: Pos;
  /** Сколько раундов ещё действуют заклинания (0 — нет). */
  buffAtk: number;
  buffDef: number;
  /** Встал в защиту — до своего следующего хода. */
  defending: boolean;
};

export type Food = { id: string; name: string; image: string | null; value: number };

/** Запас стороны: энергия на заклинания, интеллект героя, еда в трёх ячейках. */
export type SideKit = { energy: number; int: number; food: Array<Food | null> };

export type SpellId = "atk" | "def";

/** Запись хода — текст собирает экран на языке игрока. */
export type LogEntry =
  | { k: "hit"; a: string; b: string; dmg: number; shot: boolean; killed: boolean }
  | { k: "spell"; a: string; b: string; spell: SpellId; value: number }
  | { k: "eat"; a: string; food: string; value: number }
  | { k: "defend"; a: string }
  | { k: "move"; a: string }
  | { k: "flee"; side: Side }
  /** Предложение ничьей или сдаться (владелец 09.11.2026) и ответ противника. */
  | { k: "offer"; side: Side; what: OfferKind; ok: boolean }
  | { k: "round"; n: number };

export type DuelState = {
  units: Unit[];
  kits: Record<Side, SideKit>;
  obstacles: Pos[];
  round: number;
  /** Порядок ходов раунда (id) и чей ход сейчас. */
  order: string[];
  turn: number;
  rng: number;
  log: LogEntry[];
  winner: Side | null;
  fled: Side | null;
  /** Ничья по согласию (бой окончен без победителя). */
  draw?: boolean;
  /** Сторона, что сдалась по предложению противника. */
  conceded?: Side | null;
  /** Сколько ходов сделано за бой (действия бойцов; предложения не считаются). */
  moves?: number;
  /** На каком ходу сторона предлагала ничью/сдаться — следующее через OFFER_GAP. */
  offerAt?: Partial<Record<Side, number>>;
  /** Потрачено за бой: энергия и съеденная еда (для итога). */
  spent: Record<Side, { energy: number; food: string[] }>;
};

export type Action =
  | { t: "move"; to: Pos }
  | { t: "attack"; target: string; from: Pos }
  | { t: "shoot"; target: string }
  | { t: "defend" }
  | { t: "cast"; spell: SpellId; target: string }
  | { t: "eat"; slot: number }
  | { t: "flee" }
  /** Предложить ничью или сдаться; accept — ответ противника. Ход не тратит. */
  | { t: "offer"; what: OfferKind; accept: boolean };

/** Что предлагают противнику: ничью или сдаться (владелец 09.11.2026). */
export type OfferKind = "draw" | "surrender";

/** Боец для расстановки: всё, кроме позиции и состояния боя. */
export type UnitInput = Omit<Unit, "pos" | "buffAtk" | "buffDef" | "defending" | "side">;

export type SideInput = { hero: UnitInput; mobs: UnitInput[]; kit: SideKit };
