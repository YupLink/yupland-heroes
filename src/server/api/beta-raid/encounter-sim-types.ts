// Типы боя бета-рейда — вынесены из encounter-sim.ts, чтобы файл симуляции
// оставался в пределах лимита на размер.

import type { WeakenKind } from "./abilities";
import type { HeroCombat } from "@/lib/hero/heroPowerCurve";
export type SimChip = {
  templateId: string;
  level: number;
  training?: boolean;
  /** id триал-фишки из hallway_training_chips — по нему её и проверяют. */
  trainingId?: string;
  chipId?: string;
  serialNo?: number | null;
  /** Имя фишки — показываем в сводке боя, кого именно задело. */
  name?: string | null;
};

export type FieldChip = {
  level: number;
  hp: number;
  maxHp: number;
  training: boolean;
  /** Множитель атаки без героя (тираж, премиум): от него пересчёт при ослаблении. */
  atkBase: number;
  atkMult: number;
  /** id экземпляра — на него вешаются яд и оглушение после боя. */
  chipId?: string;
  name?: string | null;
  /**
   * Насколько яд срезал макс. HP этой фишки, в %.
   *
   * Яд — ДЕБАФФ, а не урон по времени: пока он висит, фишка выходит в бой с
   * уменьшенным запасом здоровья, и всё. Никаких тиков за раунд — убить сама
   * по себе отрава не может.
   */
  poisonPct: number;
};

export type ChipMults = Map<number, { hpMult: number; atkMult: number }>;

/** Что способности цели должны сделать ВНЕ боя (энергия, карта). */
export type SimSideEffects = {
  /** Сколько энергии выжжено за бой. */
  burnedEnergy: number;
  /** Замедление: +N энергии за шаг на N минут. */
  slow: { extraCost: number; minutes: number } | null;
  /**
   * Ослабление героя: −N к характеристике на N минут. Виды копятся порознь —
   * босс может сбивать и броню, и удачу, и это разные строки эффекта.
   */
  weaken: Partial<Record<WeakenKind, { value: number; minutes: number }>>;
  /** Яд и оглушение, которые надо повесить на конкретные фишки после боя. */
  chipEffects: Array<{
    chipId: string;
    kind: "poison" | "stun";
    value: number;
    minutes: number;
    /** Имя фишки — для тоста «Мурзик оглушена · 5 мин». */
    chip?: string | null;
  }>;
};

export type SimResult = {
  /** Сколько урона нанёс игрок (до клэмпа по реальному HP цели). */
  dealt: number;
  rounds: number;
  /** Отряд выбит — цель устояла. */
  wiped: boolean;
  /** Урон по раундам — для лога в окне боя. */
  log: Array<{ round: number; playerDmg: number; targetDmg: number }>;
  /** Что сработало из способностей — показываем игроку. */
  abilities: Array<{
    round: number;
    kind: string;
    amount: number;
    chipId?: string;
    /** Имя задетой фишки — для сводки боя. */
    chip?: string | null;
  }>;
  side: SimSideEffects;
};

/** Герой заново — с ослаблением, наложенным в этом бою (fight-weaken.ts). */
export type Reweaken = (weaken: SimSideEffects["weaken"]) => HeroCombat;
