// Строки состава → то, что планировщик умеет ставить.
//
// Состав пишется в рецепте парами «постройка + сколько её» (плюс галочка
// «фон»), а расстановке нужен развёрнутый список: ратуша, службы, дворы. Этот
// перевод и живёт здесь — отдельным файлом из-за потолка в 250 строк
// (settlement-place.ts — геометрия, settlement.ts — порядок и отчёт).
import { ROLE_ORDER, roleOfOption } from "@/lib/raid/zonegen/settlement-compose";
import type {
  BuildingOption,
  SettlementRecipe,
  SettlementSlot,
} from "@/lib/raid/zonegen/settlement-types";

export type SlotOption = { slot: SettlementSlot; option: BuildingOption };

/** Строки рецепта → пары «строка + шаблон»; чего нет в справочнике, то не ставим. */
export function resolveSlots(s: SettlementRecipe, options: BuildingOption[]): SlotOption[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const out: SlotOption[] = [];
  for (const slot of s.slots) {
    const option = byId.get(slot.buildingId);
    // Строка «ноль штук и не фон» не значит ничего — такую просто пропускаем.
    if (option !== undefined && (slot.count > 0 || slot.fill === true)) out.push({ slot, option });
  }
  return out;
}

/** Важность роли: чем меньше число, тем ближе к центру. Незнакомая — в хвост. */
const roleRank = (option: BuildingOption): number => {
  const at = ROLE_ORDER.indexOf(roleOfOption(option));
  return at < 0 ? ROLE_ORDER.length : at;
};

/**
 * Обязательные постройки поштучно и в городском порядке: ратуша, уникальные
 * службы, потом всё прочее; при равной важности — по порядку строк состава.
 * count=3 разворачивается в три подряд идущие штуки.
 */
export function expandRequired(slots: SlotOption[]): SlotOption[] {
  const rows = slots
    .map((s, at) => ({ s, at }))
    .filter((r) => r.s.slot.count > 0)
    .sort((a, b) => roleRank(a.s.option) - roleRank(b.s.option) || a.at - b.at);
  const out: SlotOption[] = [];
  for (const r of rows) for (let n = 0; n < r.s.slot.count; n++) out.push(r.s);
  return out;
}

/** Фоновые строки: ими добивают остаток пятна. */
export const fillSlots = (slots: SlotOption[]): SlotOption[] =>
  slots.filter((s) => s.slot.fill === true);

/**
 * Сколько построек вообще просит состав. Есть фон — сколько угодно: он затем и
 * заведён, чтобы занять остаток пятна, и потолок ему ставит только плотность.
 */
export function slotCapacity(slots: SlotOption[]): number {
  if (slots.some((s) => s.slot.fill === true)) return Number.POSITIVE_INFINITY;
  return slots.reduce((sum, s) => sum + s.slot.count, 0);
}
