// ДОБЫЧА одним разделом: сундуки и монетки вместе.
//
// Владелец просил не разделять их в панели: «разница только в том, что монеткам
// я не задаю паки и артефакты». Но на карте они расходятся по двум группам —
// по ним устроены снятие отработавших и отчёт, и это трогать нельзя. Поэтому
// раздел один, фонд один, а вид каждого объекта решает его шаблон (запас HP).
//
// Считаем ровно так же, как считал раздел кучек: та же точка разброса, тот же
// потолок номинала и тот же жребий. Разница только в том, что заготовки в
// конце раскладываются по двум корзинам вместо одной.
import { buildPiles } from "./scatter-piles";
import { type GroupBuild } from "./scatter-parts";
import type { Rnd } from "@/lib/raid/scatterMath";
import { type Tpl } from "./scatter-tpl";
import type { PilePlan } from "@/lib/raid/scatterPlan";

type LootTpl = Tpl & { group: "chest" | "coin" };

/**
 * Разложить общий план добычи на две серверные группы.
 *
 * Фонд НЕ делим пополам: он один на раздел, и жребий раздаёт его по всем
 * кучкам сразу — иначе «миллион на добычу» превращался бы в два по полмиллиона
 * с разными потолками. Поэтому считаем одним проходом (buildPiles), а потом
 * растаскиваем готовые заготовки по группам их шаблонов.
 */
export function buildLoot(plan: PilePlan, tpls: LootTpl[], rnd: Rnd = Math.random): GroupBuild[] {
  // Вид объекта известен по его id: заготовка несёт `chest:<шаблон>`.
  const kindOf = new Map(tpls.map((t) => [t.id, t.group]));
  // Считаем как раньше — под именем той группы, которой в списке больше:
  // подписи примечаний должны звучать по-человечески («Сундуки: фонда хватило
  // на…»), а не по внутреннему ключу.
  const coins = tpls.filter((t) => t.group === "coin").length;
  const main = coins > tpls.length - coins ? "coin" : "chest";
  const built = buildPiles(plan, main, tpls, rnd);

  const drafts = { chest: [] as GroupBuild["drafts"], coin: [] as GroupBuild["drafts"] };
  for (const d of built.drafts) {
    const id = d.objectId.split(":")[1] ?? "";
    drafts[kindOf.get(id) ?? "chest"].push({ ...d, group: kindOf.get(id) ?? "chest" });
  }
  // Примечания отдаём той группе, под чьим именем считали, чтобы они не
  // задвоились в отчёте.
  return [
    { group: "chest", drafts: drafts.chest, notes: main === "chest" ? built.notes : [] },
    { group: "coin", drafts: drafts.coin, notes: main === "coin" ? built.notes : [] },
  ];
}
