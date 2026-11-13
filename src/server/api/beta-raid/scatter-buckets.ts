// Заявки автораздачи на клетки: своя на каждую тройку «группа + местность +
// моб ли». Вынесено из scatter.ts ради лимита ≤250 строк.
//
// Моб — босс или убегающее существо-«сундук» (Фей, Заяц DarAi… — шаблон с
// meta.flees): генерация не ставит их на дорогу и жилу (владелец, 22.10.2026;
// mob-ground). Обычные сундуки, монетки и артефакты — как прежде, дорога им можно.
import { bareTplId, fleeingTplIds, isMobId } from "./mob-ground";
import type { GroupBuild, ScatterDraft } from "./scatter-parts";
import type { ScatterGroup } from "@/lib/raid/scatterPlan";

/** Заявка на клетки. */
export type Bucket = {
  group: ScatterGroup;
  drafts: ScatterDraft[];
  terrainId: string | null;
  /** «Только эти местности» (уровень местности); null — любая суша. */
  terrains: string[] | null;
  /** Моб или убегающее существо: ни дороги, ни жилы. */
  mob: boolean;
};

/** Кто из заготовок — моб: босс по id или существо с убегающим шаблоном. */
async function mobCheck(builds: GroupBuild[]): Promise<(d: ScatterDraft) => boolean> {
  const items = builds.some((b) => b.drafts.some((d) => !isMobId(d.objectId)));
  const fleeing = items ? await fleeingTplIds() : new Set<string>();
  return (d) => isMobId(d.objectId) || fleeing.has(bareTplId(d.objectId));
}

/**
 * Разложить заготовки по заявкам. Порядок групп сохраняем: подбор обслуживает
 * заявки по очереди, и боссы с их редкими местностями должны выбирать раньше
 * «куда угодно»-артефактов.
 */
export async function buckets(builds: GroupBuild[]): Promise<Bucket[]> {
  const isMob = await mobCheck(builds);
  const out: Bucket[] = [];
  for (const b of builds) {
    const byKey = new Map<string, { land: string; mob: boolean; drafts: ScatterDraft[] }>();
    for (const d of b.drafts) {
      const land = d.terrainId ?? "";
      const mob = isMob(d);
      const k = `${land}|${mob ? 1 : 0}`;
      const e = byKey.get(k) ?? { land, mob, drafts: [] };
      e.drafts.push(d);
      byKey.set(k, e);
    }
    for (const e of byKey.values()) {
      out.push({
        group: b.group,
        drafts: e.drafts,
        terrainId: e.land || null,
        terrains: b.terrains ?? null,
        mob: e.mob,
      });
    }
  }
  return out;
}
