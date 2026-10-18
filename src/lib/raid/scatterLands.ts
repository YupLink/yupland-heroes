// Куда класть: местности, отмеченные админом у раздела раздачи.
//
// Раньше местность знал только шаблон — радужный босс вставал на радугу, потому
// что так написано в его карточке. Владелец просил обратного: «выбрал три
// местности и раскидал по ним», «пятьдесят в аду». Поэтому выбор админа
// местность шаблона ПЕРЕБИВАЕТ, а пустой выбор возвращает прежнее поведение.
//
// Счёт живёт в src/lib, а не у сервера: этой же арифметикой панель пишет сводку
// раздела и предупреждение о дефиците. Разойдись два счёта — админ увидел бы
// «50 в аду», а на карту легло бы сорок.
import { MAX_PER_GROUP, type ScatterLand } from "./scatterPlan";

/** Сколько объектов досталось местности после разноса общего числа. */
export type LandQuota = { terrainId: string; count: number };

/** Целое и неотрицательное, что бы ни пришло: план собирают и руками. */
const int = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/**
 * Разнести общее число по отмеченным местностям.
 *
 * Правило одно, и оно же написано админу под полями: у кого проставлено своё
 * число — берёт его; остальные делят поровну общее «Сколько». Остаток от
 * деления уходит первым в списке: раздавать «по 16,67 босса» нельзя, а терять
 * два штуки на округлении обиднее, чем дать первой местности на одного больше.
 *
 * Потолок группы режет уже СУММУ, а не каждую строку: сорок местностей по пять
 * тысяч — это двести тысяч объектов на карте в шестнадцать тысяч клеток.
 */
export function landQuotas(lands: ScatterLand[], base: number): LandQuota[] {
  const free = lands.filter((l) => l.count === null).length;
  const share = free > 0 ? int(base) : 0;
  const each = free > 0 ? Math.floor(share / free) : 0;
  let extra = free > 0 ? share - each * free : 0;
  let left = MAX_PER_GROUP;

  return lands.map((l) => {
    let want = int(l.count ?? 0);
    if (l.count === null) {
      want = each;
      if (extra > 0) {
        want += 1;
        extra -= 1;
      }
    }
    const count = Math.min(want, Math.max(0, left));
    left -= count;
    return { terrainId: l.terrainId, count };
  });
}

/**
 * Сколько объектов просит раздел: без отметок — своё поле, с отметками — их
 * сумма. Именно она, а не поле «Сколько»: «50 в аду и 30 в раю» — это восемьдесят
 * боссов, даже если общее поле пустое.
 */
export function landTotal(lands: ScatterLand[], base: number): number {
  if (lands.length === 0) return Math.min(int(base), MAX_PER_GROUP);
  return landQuotas(lands, base).reduce((a, q) => a + q.count, 0);
}

/**
 * Местность на каждый объект по порядку; `null` — «как у шаблона».
 *
 * Длина ровно `total`, потому что счёт объектов не всегда равен сумме квот: у
 * кучек фонд кончается раньше, и лишние квоты просто не разыгрываются, а хвост
 * сверх квот уходит шаблонной местности, а не пропадает молча.
 */
export function spreadLands(
  total: number,
  lands: ScatterLand[],
  base: number,
): Array<string | null> {
  const out: Array<string | null> = [];
  for (const q of landQuotas(lands, base)) {
    for (let i = 0; i < q.count && out.length < total; i += 1) out.push(q.terrainId);
  }
  while (out.length < total) out.push(null);
  return out;
}
