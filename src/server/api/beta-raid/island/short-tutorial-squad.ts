// Бой требует фишки, не только героя. Для короткой истории открываем один
// существующий учебный пак автоматически, если у аккаунта совсем нет фишек.
// Грант один на аккаунт; его экземпляры и открытие идемпотентны.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";

export type ShortStarterChip = { templateId: string; level: number; image: string; name: string; training?: boolean; trainingId?: string };

/** Вызывается из getMyIsland только после реального сундука нового пилотного острова. */
export async function prepareShortTutorialSquad(wallet: string, account: string): Promise<ShortStarterChip[]> {
  const acc = sqlStr(account);
  const ready = await mcpExec(`SELECT (
    EXISTS (SELECT 1 FROM yuplink.user_chip_inventory WHERE account_id = ${acc} AND status = 'owned')
    OR EXISTS (SELECT 1 FROM yuplink.hallway_training_chips WHERE account_id = ${acc} AND consumed_at IS NULL)
  ) AS has_chips;`, { wrapJson: true }) as Array<{has_chips: boolean}>;
  if (ready?.[0]?.has_chips !== true) {
    const grantId = `'cpg_short_' || substr(md5(${acc}), 1, 16)`;
    // Бесплатная игровая выдача использует event, как drop в packs.ts.
    await mcpExec(`INSERT INTO yuplink.chip_pack_grants
      (id, account_id, wallet, chip_pack_id, source, source_ref, granted_at, tickets_spent)
      VALUES (${grantId}, ${acc}, ${sqlStr(wallet)}, ${sqlStr(ISLAND_TRAINING_PACK)},
        'event', ${sqlStr(`island:short:${account}:squad`)}, now(), 0)
      ON CONFLICT (id) DO NOTHING;`);
    const grants = await mcpExec(`SELECT id, account_id, opened_at FROM yuplink.chip_pack_grants
      WHERE id = ${grantId} AND account_id = ${acc};`, { wrapJson: true }) as Array<{id: string; account_id: string; opened_at: string | null}>;
    const grant = grants?.[0];
    if (!grant) throw new Error("Не удалось подготовить стартовый отряд. Повтори попытку.");
    if (!grant.opened_at) {
      const { openTrainingPack } = await import("./island-pack");
      await openTrainingPack(wallet, grant);
    }
  }
  const training = await mcpExec(`SELECT id, star FROM yuplink.hallway_training_chips
    WHERE account_id = ${acc} AND consumed_at IS NULL ORDER BY star DESC, id LIMIT 10;`,
    { wrapJson: true }) as Array<{id: string; star: number | string}>;
  if (training?.length) return training.map((c) => ({
    templateId: `train:${Number(c.star)}`, level: Number(c.star), image: "", name: "Тренировочная",
    training: true, trainingId: c.id,
  }));
  // У опытного тестера уже могут быть обычные фишки: берём штатный авто-отряд.
  const { resolveLineupInfo } = await import("../encounter-lineup");
  try {
    const picked = await resolveLineupInfo(wallet, []);
    return picked.lineup.map((c) => ({ ...c, image: "", name: c.name ?? "" }));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Нет фишек для боя")) return [];
    throw e;
  }
}
