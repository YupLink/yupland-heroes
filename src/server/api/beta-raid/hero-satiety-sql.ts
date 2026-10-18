// SQL сытости героя: сдвиг в пределах 0…потолок одним UPDATE (пусто в базе —
// шкала полная). Отдельно от hero-satiety, чтобы построитель шага
// (move-step-sql) не тянул за собой расчёт силы героя.
import { sqlStr } from "@/server/api/raid-shared";

export const satietyMoveSql = (
  heroId: string,
  max: number,
  delta: number,
  andWhere = "",
): string => {
  const m = Math.max(0, Math.round(max));
  const d = Number.isFinite(delta) ? delta : 0;
  return `UPDATE yuplink.hero_instance h
     SET satiety = GREATEST(0, LEAST(${m}, LEAST(${m}, COALESCE(h.satiety, ${m})) + (${d})))
   WHERE h.id = ${sqlStr(heroId)}${andWhere ? ` AND ${andWhere}` : ""}
   RETURNING h.satiety`;
};
