// Сверка порталов (владелец, 30.10.2026): страница только на чтение для
// Ангелины и админов — сколько порталов в каждом мире, какие ведут в другой
// мир, куда и сколько игроков видят вход. Личных данных нет, только счёт.
//
// Общий модуль: тип ответа нужен серверу (portal-check.ts) и странице.

export type PortalCheckEntry = {
  /** Клетка постройки входа. */
  q: number;
  r: number;
  /** Остальные клетки блока режима бога (вход виден по любой). */
  others: Array<[number, number]>;
  /** Миры назначения (название этажа). */
  to: string[];
  /** Сеть выводит и в этот же мир. */
  alsoHere: boolean;
  /** Вход под глухим туманом — игрокам не виден. */
  void: boolean;
  /** Игроков, стоящих в этом мире. */
  onMap: number;
  /** Из них разведали хотя бы одну клетку входа. */
  seenBy: number;
};

export type PortalCheckWorld = {
  name: string;
  /** Все порталы мира и разбивка: двери, этаж закрыт, без пары, внутри мира. */
  total: number;
  doors: number;
  closed: number;
  alone: number;
  inner: number;
  cross: PortalCheckEntry[];
};

export type PortalCheckWire = {
  worlds: PortalCheckWorld[];
  /** Острова новичка с порталом и куда он ведёт. */
  islands: { count: number; to: string };
};
