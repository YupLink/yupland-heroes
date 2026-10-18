// Что окно постройки узнаёт про ШАХТУ (сервер → окно).
//
// Отдельным модулем, как столб заклинаний (spellbookExtra.ts): общий союз
// BuildingExtra (buildingEffect.types.ts) упирается в лимит 250 строк на файл.
// Потребители берут типы оттуда же, где и раньше (`@/lib/buildingEffect`).

/** Ресурсы, которые может добывать шахта. */
export type MineResource =
  | "likes"
  | "tickets"
  | "energy"
  | "gold"
  | "stone"
  | "diamonds"
  | "wood"
  | "token"
  | "custom";

export type MineExtra = {
  kind: "mine";
  /** Что добывает шахта и сколько за час. */
  resource: MineResource;
  token: string | null;
  yieldAmount: number;
  /** Сколько энергии стоит захват. */
  captureCost: number;
  /** Чья шахта сейчас: моя / чужая / свободна. */
  mine: "own" | "enemy" | "free";
  /** Секундомер: когда шахту захватили (мс) — клиент считает часы сам. */
  capturedAt: number | null;
  /** Сколько целых часов текущий владелец уже забрал. */
  claimedHours: number;
  /** Предел часов добычи от захвата (лесопилка острова — неделя); null — без предела. */
  maxHours?: number | null;
  /** Готовая к сбору добыча на момент ответа (снимок). */
  pending: number;
  /**
   * Босс-охранник шахты, если ЖИВ. Владелец видит поставленного босса,
   * чужой — «сначала бой». null — охраны нет / повержен.
   */
  guardian: {
    templateId: string;
    name: string;
    image: string | null;
    background: string | null;
    maxHp: number;
    currentHp: number;
    damage: string | null;
    /** Способности охранника — для блока «Опасности»; «10-20» едет строкой. */
    abilities: Array<{
      kind: string;
      chance: number;
      value: string | number;
      duration: string | number;
    }>;
  } | null;
  can: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};
