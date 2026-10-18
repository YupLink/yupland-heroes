// Тренировочный пак острова (владелец, 14.10.2026: «в одном из боссов —
// пак с тренировочными фишками, чтобы показать, что это можно добыть из
// боссов, и как открыть»). Открывается в «Паки» тем же окном, что любой пак,
// но вместо фишек коллекции даёт тренировочные (hallway_training_chips):
// бьются вполсилы, не продаются за билеты (isStarterChip), в NFT не выходят.
//
// Грант уже захвачен (claimChipPackGrant) — здесь выдача и отметка открытия.
// id фишек — от гранта: повтор после сбоя не выдаст вторую тройку.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { TRAINING_PACK_CHIPS } from "@/lib/raid/island/catalog";

export const ISLAND_PACK_CHIP_SOURCE = "island_pack";
const STARS = [1, 1.5, 2, 2.5, 3];

type Grant = { id: string; account_id: string | null };

export type TrainingReveal = {
  collectionId: string | null;
  templateId: string | null;
  level: number;
  templateName: string;
  imageUrl: string;
  collectionName: string;
};

async function starImages(): Promise<Record<string, string | null>> {
  try {
    const { getHallwayConfig } = await import("../../hallwayConfig");
    return (await getHallwayConfig()).images.chipByStar ?? {};
  } catch {
    return {};
  }
}

export async function openTrainingPack(wallet: string, grant: Grant): Promise<TrainingReveal[]> {
  const stars = Array.from(
    { length: TRAINING_PACK_CHIPS },
    () => STARS[Math.floor(Math.random() * STARS.length)],
  );
  const ids = stars.map((_, i) => sqlStr(`${grant.id}_t${i}`));
  const values = stars
    .map(
      (star, i) =>
        `(${ids[i]}, ${sqlStr(wallet)}, ${star}, ` +
        `${sqlStr(ISLAND_PACK_CHIP_SOURCE)}, now(), ${grant.account_id ? sqlStr(grant.account_id) : "NULL"})`,
    )
    .join(", ");
  await mcpExec(
    `INSERT INTO yuplink.hallway_training_chips (id, wallet, star, source, obtained_at, account_id)
     VALUES ${values} ON CONFLICT (id) DO NOTHING;`,
  );
  // Показываем выданное на самом деле (повтор — те же три, а не новые броски).
  const rows = (await mcpExec(
    `SELECT star FROM yuplink.hallway_training_chips
      WHERE id IN (${ids.join(", ")}) ORDER BY id;`,
    { wrapJson: true },
  )) as Array<{ star: number | string }>;
  const got = (rows ?? []).map((r) => Number(r.star));
  if (got.length === 0) throw new Error("Не удалось открыть пак — попробуй ещё раз");
  await mcpExec(
    `UPDATE yuplink.chip_pack_grants
        SET opened_at = now(),
            result_chips = ${sqlStr(JSON.stringify(got.map((level) => ({ training: true, level }))))}::jsonb
      WHERE id = ${sqlStr(grant.id)};`,
  );
  const images = await starImages();
  return got.map((level) => ({
    collectionId: null,
    templateId: null,
    level,
    templateName: "Тренировочная фишка",
    imageUrl: images[String(level)] ?? "",
    collectionName: "Тренировочные",
  }));
}
