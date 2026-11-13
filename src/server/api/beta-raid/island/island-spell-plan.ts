// Read an actual configured world pillar, including its existing art and price.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { TownCatalog } from "@/lib/raid/worldgen/town";
import { canFundPillar, type ShortSpellPillar } from "@/lib/raid/island/shortSpell";
import { cellBuildingEffect } from "@/lib/buildingEffect";
import { activeBetaMapId } from "../encounter-where";
import { spellPillarConfig } from "../spell-pillar";
import { loadSpellTemplates } from "../spell-tpl";

type PillarRow = { building_id: string; building_skin_id: string | null; config: unknown; meta: unknown; name: string | null };

export async function islandSpellPlan(catalog: TownCatalog): Promise<ShortSpellPillar> {
  const mapId = await activeBetaMapId();
  const [rows, spells] = await Promise.all([
    mcpExec(`SELECT c.building_id, c.building_skin_id, c.building_config AS config, t.meta, t.name
      FROM yuplink.raid_map_cells c JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)} AND COALESCE(t.active, true)
        AND (c.building_config->>'effect' = 'spellbook' OR t.meta->>'effect' = 'spellbook')
      ORDER BY c.q, c.r;`, { wrapJson: true }) as Promise<PillarRow[]>,
    loadSpellTemplates(),
  ]);
  for (const row of rows ?? []) {
    const template = catalog.byId.get(row.building_id);
    if (!template || template.tiers < 1 || cellBuildingEffect(row.config, row.meta, row.name) !== "spellbook") continue;
    const cfg = spellPillarConfig(row.config, row.meta);
    if (!cfg || !canFundPillar(cfg.learnPrices)) continue;
    const spell = spells.filter((s) => s.minInt <= 0 && (!cfg.spells.length || cfg.spells.includes(s.id)))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!spell) continue;
    return {
      buildingId: template.id, buildingSkinId: row.building_skin_id,
      tier: template.tiers - 1,
      spellbook: { ...cfg, spells: [spell.id] },
    };
  }
  throw new Error("Не удалось подготовить столб заклинаний для обучения. Попробуй позже.");
}
