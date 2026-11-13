// Изготовление заготовки шахты — порядок шагов без базы (зависимости снаружи,
// craft.ts). Инвариант как у покупки в маркете (market-buy): всё, что может
// отказать без денег, — ДО оплаты (герой, уровень/«Строитель», вид, место в
// рюкзаке, товары цены); оплата — ресурсы и товары — одной транзакцией
// (castle_architect_pay); заготовка не легла
// в рюкзак — оплата возвращается (castle_architect_refund) и ошибка уходит игроку.
//
// «Не легла» решает ключ выдачи в рюкзак (raid_backpack_op), а не ошибка: ответ
// выдачи теряется и ПОСЛЕ коммита — возврат дал бы и заготовку, и ресурсы.
// Ключ запирается и оплата возвращается одним оператором (craft-undo.ts): иначе
// опоздавшая выдача ложилась бы после возврата. Откат не прошёл — он атомарен,
// повтор с тем же ключом нажатия доведёт выдачу через статус 'repeat'; окно
// закрыли — оплату вернёт добор (blueprint-sweep.ts). Откат вернул оплату —
// ошибка уходит с меткой (castleArchitectMark): окно берёт новый ключ.
//
// Добор мог запереть ключ выдачи раньше нас: выдача тогда видит готовый ключ и
// молча «проходит», ничего не положив, а откат по своему снимку говорит
// «легла» (возврат добора снимок не видит). Решает отдельное свежее чтение
// оплаты: добор ставит ключ и возврат одной транзакцией, а ключ, поставленный
// выдачей, возврат исключает — вернули ⇔ заготовки от этого нажатия нет.
import { BUILDER_SPEC } from "@/lib/buildingEffect";
import { BLUEPRINT_LEVEL, craftProblem, type ArchitectCost } from "@/lib/castleArchitect";
import { OP_REFUNDED, markRefunded } from "@/lib/castleArchitectMark";
import type { BlueprintResource } from "@/lib/mineBlueprint";
import type { UndoResult } from "./craft-undo";
import { SWEEP_AFTER_MIN } from "./craft-keys";

/** Свежая оплата, выданная быстрее этого, добору недоступна — перечитывать незачем. */
const RECHECK_AFTER_MS = (SWEEP_AFTER_MIN * 60_000) / 2;

/** Рюкзак выбранного героя: владелец, специализация и ёмкости. */
export type CraftBag = {
  heroId: string;
  spec: string | null;
  capacity: number;
  potionCapacity: number;
};

/** Ответ оплаты: списали сейчас / уже было списано этим ключом / уже возвращено. */
export type PayStatus = "paid" | "repeat" | "refunded";

export type CraftDeps = {
  backpack: () => Promise<CraftBag | null>;
  level: () => Promise<number>;
  cost: (kind: BlueprintResource) => Promise<ArchitectCost>;
  /**
   * Влезет ли ещё одна заготовка; нет — бросок market.backpack_need (до денег).
   * Товары цены уходят из того же рюкзака раньше выдачи — их место свободно.
   */
  assertRoom: (bag: CraftBag, cost: ArchitectCost) => Promise<void>;
  /** Хватает ли товаров цены в рюкзаке; нет — бросок architect.no_goods:<список>. */
  assertGoods: (bag: CraftBag, cost: ArchitectCost) => Promise<void>;
  /** Ресурсы и товары (из рюкзака героя bag) — одной транзакцией. */
  pay: (cost: ArchitectCost, bag: CraftBag) => Promise<PayStatus>;
  deposit: (bag: CraftBag) => Promise<void>;
  /** Выдача упала: запереть её ключ и вернуть оплату — или узнать, что легла. */
  undo: () => Promise<UndoResult>;
  /** Оплата этого ключа возвращена — отдельным оператором (свежий снимок). */
  refunded: () => Promise<boolean>;
};

/** Ошибка базы → ключ отказа Архитектора (перевод — lib/castleArchitectText). */
export function architectError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/res_move: в минус/.test(msg)) return new Error("architect.no_resources");
  if (/architect_level_moved/.test(msg)) return new Error("architect.level_moved");
  if (/architect_max_level/.test(msg)) return new Error("architect.max_level");
  // Товары: гонка мимо предпроверки — имя и недостача из базы.
  const goods = /architect_no_goods:([^\n]*)/.exec(msg);
  if (goods) return new Error(`architect.no_goods:${goods[1].trim()}`);
  if (/architect_need_hero/.test(msg)) return new Error("market.need_hero");
  return e instanceof Error ? e : new Error(msg || "Не удалось");
}

export async function craftBlueprint(
  kind: BlueprintResource,
  deps: CraftDeps,
): Promise<{ ok: true; kind: BlueprintResource; applied: boolean }> {
  const bag = await deps.backpack();
  if (!bag) throw new Error("market.need_hero");
  const builder = bag.spec === BUILDER_SPEC;
  const problem = craftProblem(kind, await deps.level(), builder);
  if (problem === "soon") throw new Error("architect.soon");
  if (problem === "level") throw new Error(`architect.level_needed:${BLUEPRINT_LEVEL[kind]}`);
  const cost = await deps.cost(kind);
  await deps.assertRoom(bag, cost);
  await deps.assertGoods(bag, cost);

  const paidAt = Date.now();
  let status: PayStatus;
  try {
    status = await deps.pay(cost, bag);
  } catch (e) {
    throw architectError(e);
  }
  // Этот ключ уже вернули: выдать заготовку сейчас — отдать её даром.
  if (status === "refunded") throw new Error(OP_REFUNDED);

  try {
    await deps.deposit(bag);
  } catch (e) {
    const undo = await deps.undo().catch((why: unknown) => {
      // Откат атомарен: не лёг — повтор с тем же ключом выдаст заготовку, лёг
      // молча — повтор получит 'refunded'. Ни там, ни там не выйдет «и то и то».
      console.error("[architect] откат выдачи заготовки не прошёл", why);
      return null;
    });
    if (undo === "landed") {
      // «Легла» по снимку отката — ключ мог запереть добор. Не прочли — ошибка
      // без метки: повтор тем же ключом решит заново.
      const back = await deps.refunded().catch(() => null);
      if (back === null) throw e;
      // Легла — ответ просто потерялся: это успех, возвращать нечего.
      if (!back) return { ok: true, kind, applied: status === "paid" };
    }
    // Оплата этого ключа возвращена (сейчас, раньше или добором): текст —
    // исходный, метка — окну, чтобы следующее нажатие шло новым ключом.
    if (undo) throw new Error(markRefunded(e instanceof Error ? e.message : String(e ?? "")));
    throw e;
  }
  // Повтор старого ключа или долгая выдача — добор мог успеть: выдача «прошла»
  // по его ключу. Сбой чтения — ошибка без метки, повтор тем же ключом.
  const late = status === "repeat" || Date.now() - paidAt > RECHECK_AFTER_MS;
  if (late && (await deps.refunded())) throw new Error(OP_REFUNDED);
  return { ok: true, kind, applied: status === "paid" };
}
