// Значок «магия столба забрана» — для ВЫБРАННОГО героя, одним запросом на карту.
//
// Что значит «забрал». Столб учит списку заклинаний (building_config.spellbook
// клетки, а нет своего — meta.spellbook шаблона; пустой список — всему живому
// каталогу). Где именно выучено, база не хранит: у hero_spellbook ключ
// (герой, заклинание), а журнал нажатий hero_boost_op знает только id
// заклинания. Поэтому считаем по книге: столб забран, когда ВСЁ живое, чему он
// учит, у героя уже есть — взять там больше нечего. Столб с одним заклинанием
// (так стоят все 22 на проде) помечается сразу после изучения; то же заклинание,
// выученное у соседнего столба, закрывает и этот. Забыл — значок снимается.
// Столб, который ничему не учит (пустой список при пустом каталоге или только
// выключенные заклинания), забранным не считается: брать там было нечего.
//
// Герой берётся ПРЯМО из базы, а не из кэша силы героя: тот живёт в каждом
// воркере по 15 секунд, и после смены героя значки ещё показывали бы прежнего.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { raidOwner } from "./owner";
import { spellPillarConfig } from "./spell-pillar";
import { canIgnoreVoid } from "./voidGate";
import { voidSql } from "./voidCells";
import { cellBuildingEffect } from "@/lib/buildingEffect";

/** Клетки «q,r» — тем же ключом, что флажки шахт (mine-flags.ts). */
export type SpellPillarMarks = { heroId: string | null; cells: string[] };

/** Забран ли столб: всё живое, чему он учит, герой уже знает. */
export function pillarTaken(
  spells: readonly string[],
  active: ReadonlySet<string>,
  known: ReadonlySet<string>,
): boolean {
  const offer = (spells.length > 0 ? spells : [...active]).filter((id) => active.has(id));
  return offer.length > 0 && offer.every((id) => known.has(id));
}

type PillarRow = { q: number; r: number; config: unknown; meta: unknown; name: string | null };
type BookRow = { hero_id: string; spell_id: string | null };

// Столбы карты: эффект клетки (режим бога) или шаблона. Точный разбор — в
// коде (cellBuildingEffect), SQL лишь отсекает всё прочее. Под глухим туманом
// игроку не отдаём ничего: значок выдал бы, что за стеной стоит столб (так же
// спрятаны сундуки, chest-list.ts, и двери, gate-tolls.ts).
const pillarsSql = (mapId: string, hideVoid: boolean) =>
  `SELECT c.q, c.r, c.building_config AS config, t.meta, t.name
     FROM yuplink.raid_map_cells c
     JOIN yuplink.mystic_item_template t ON t.id = c.building_id
    WHERE c.map_id = ${sqlStr(mapId)} AND c.building_id IS NOT NULL
      AND (c.building_config->>'effect' = 'spellbook' OR t.meta->>'effect' = 'spellbook')
      ${hideVoid ? `AND NOT COALESCE(${voidSql("c")}, false)` : ""};`;

// Выбранный герой и его книга одним запросом; героя нет — ноль строк.
const bookSql = (account: string) =>
  `SELECT h.id AS hero_id, b.spell_id
     FROM (SELECT id FROM yuplink.hero_instance
            WHERE account_id = ${sqlStr(account)} AND selected_at IS NOT NULL
            ORDER BY selected_at DESC LIMIT 1) h
     LEFT JOIN yuplink.hero_spellbook b ON b.hero_id = h.id;`;

export async function spellPillarMarksFor(wallet: string): Promise<SpellPillarMarks> {
  const [mapId, account] = await Promise.all([myMapId(wallet), raidOwner(wallet)]);
  const [pillars, book, active] = (await Promise.all([
    mcpExec(pillarsSql(mapId, !canIgnoreVoid(wallet)), { wrapJson: true }),
    mcpExec(bookSql(account), { wrapJson: true }),
    mcpExec(`SELECT id FROM yuplink.raid_spell WHERE active;`, { wrapJson: true }),
  ])) as [PillarRow[], BookRow[], Array<{ id: string }>];
  const heroId = book?.[0]?.hero_id ? String(book[0].hero_id) : null;
  if (!heroId) return { heroId: null, cells: [] };
  const known = new Set((book ?? []).flatMap((b) => (b.spell_id ? [String(b.spell_id)] : [])));
  const live = new Set((active ?? []).map((s) => String(s.id)));
  const cells: string[] = [];
  for (const p of pillars ?? []) {
    if (cellBuildingEffect(p.config, p.meta, p.name) !== "spellbook") continue;
    const cfg = spellPillarConfig(p.config, p.meta);
    if (cfg && pillarTaken(cfg.spells, live, known)) cells.push(`${Number(p.q)},${Number(p.r)}`);
  }
  return { heroId, cells };
}

export const getSpellPillarMarks = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpellPillarMarks> => spellPillarMarksFor(await requireBetaRaid()),
);
