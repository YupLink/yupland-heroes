// Возврат съеденных грибов (владелец, 25.10.2026, ПРАВИЛА §8.85) — шаг минутного
// обхода (dmine-sweep). Решает база: raid_mushroom_respawn_due (migrations/mushroom-13)
// — через 12 часов после съедения один бросок 50 %; выпало — гриб того же вида встаёт
// на одной из свободных жил своего вида;
// ответ — в виде ответа ежечасного появления, рассылка та же (dmine-spawn).
// Отдельно от ручки «Съесть» (dmine-eat): та попадает в клиентскую сборку.
import { randomUUID } from "node:crypto";
import { mcpExec } from "@/server/db/mcpClient";
import { announceSpawn, spawnResOf } from "@/server/api/beta-raid/dmine/dmine-spawn";

/** Шаг обхода: съеденные, чьи 12 часов вышли, — на жилы и рассылка. Отдаёт, сколько встало. */
export async function respawnEatenMushrooms(): Promise<number> {
  const res = spawnResOf(
    // Ключ вызова: мост повторяет вслепую — повтор вернёт те же клетки (mushroom-13).
    await mcpExec(
      `SELECT yuplink.raid_mushroom_respawn_due('respawn:${randomUUID()}', 20) AS res`,
      {
        wrapJson: true,
      },
    ),
  );
  if (!res || res.cells.length === 0) return 0;
  await announceSpawn(res);
  return res.spawned;
}
