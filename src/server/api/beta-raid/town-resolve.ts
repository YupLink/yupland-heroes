// Реестр ратуш карты: какая клетка — ратуша (raid_town).
//
// Город — не зона клеток (её упразднили, владелец 04.10.2026), а ратуша и
// лавки, привязанные к ней галочкой в настройке лавки (town-binding.ts).
// Поставили ратушу — она в реестре; убрали — из реестра, а привязанные к ней
// лавки снова торгуют сами по себе.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

let townSchemaEnsured = false;

/**
 * Ленивая накатка миграций town-02 и town-03. Идемпотентно (IF NOT EXISTS).
 * Вызывать ПЕРЕД любой операцией с ратушами — так первая правка в новой
 * выкатке не падает на «relation does not exist». Не блокируем остальные
 * слои: фича новая, ретрайнем в следующий вызов.
 */
export async function ensureTownSchema(): Promise<void> {
  if (townSchemaEnsured) return;
  try {
    await mcpExec(
      `CREATE TABLE IF NOT EXISTS yuplink.raid_town (
         map_id TEXT NOT NULL, q INTEGER NOT NULL, r INTEGER NOT NULL,
         config JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (map_id, q, r)
       );
       CREATE INDEX IF NOT EXISTS raid_town_map_idx ON yuplink.raid_town(map_id);
       ALTER TABLE yuplink.raid_market_shop
         ADD COLUMN IF NOT EXISTS town_q INTEGER,
         ADD COLUMN IF NOT EXISTS town_r INTEGER;
       CREATE TABLE IF NOT EXISTS yuplink.raid_town_stock (
         map_id TEXT NOT NULL, q INTEGER NOT NULL, r INTEGER NOT NULL,
         good_id TEXT NOT NULL,
         amount NUMERIC NOT NULL DEFAULT 0,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (map_id, q, r, good_id)
       );
       CREATE INDEX IF NOT EXISTS raid_town_stock_map_idx ON yuplink.raid_town_stock(map_id);`,
      { wrapJson: false },
    );
    // Стартовый шаблон постройки-ратуши: чтобы «Ратуша» сразу оказалась в
    // палитре hex-editor и не требовала ручного захода в /admin/assets.
    // Идемпотентно (WHERE NOT EXISTS): если админ уже создал/переименовал
    // свой шаблон с effect='town_hall' — второй раз не заводим.
    await mcpExec(
      `INSERT INTO yuplink.mystic_item_template
         (id, kind, name, description, image_url, meta, active, created_at, created_by_wallet)
       SELECT 'building_town_hall', 'building', 'Ратуша',
              'Постройка города. Лавки привязываются к ратуше галочкой в своей настройке и торгуют её товарами по её ценам. Настройки жителей, товаров и цен — в самой ратуше.',
              NULL, '{"effect":"town_hall"}'::jsonb, true, now(), 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM yuplink.mystic_item_template
           WHERE kind = 'building' AND meta->>'effect' = 'town_hall'
        );`,
      { wrapJson: false },
    );
    // То же и для «Столба заклинаний»: без шаблона в палитре его не выбрать,
    // и админ обходился через «сначала храм, потом effect через панель клетки».
    await mcpExec(
      `INSERT INTO yuplink.mystic_item_template
         (id, kind, name, description, image_url, meta, active, created_at, created_by_wallet)
       SELECT 'building_spellbook', 'building', 'Столб заклинаний',
              'Школа магии: герой платит и разучивает временные заклинания-баффы (см. spell-effects). Настройки школы — в самой постройке.',
              NULL, '{"effect":"spellbook"}'::jsonb, true, now(), 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM yuplink.mystic_item_template
           WHERE kind = 'building' AND meta->>'effect' = 'spellbook'
        );`,
      { wrapJson: false },
    );
    // Покои: герой отдыхает и с игрока снимаются дебаффы за плату. Цены
    // задаются админом на самой клетке (chambersPrices), список дебаффов
    // фиксированный: замедление + ослабления героя + стан/яд на фишках.
    await mcpExec(
      `INSERT INTO yuplink.mystic_item_template
         (id, kind, name, description, image_url, meta, active, created_at, created_by_wallet)
       SELECT 'building_chambers', 'building', 'Покои',
              'Место отдыха: за плату снимает с игрока замедление и ослабления, а с его фишек — оглушение и яд. Цены задаёт админ на клетке.',
              NULL, '{"effect":"chambers"}'::jsonb, true, now(), 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM yuplink.mystic_item_template
           WHERE kind = 'building' AND meta->>'effect' = 'chambers'
        );`,
      { wrapJson: false },
    );
    townSchemaEnsured = true;
  } catch (e) {
    console.warn("[town] ensureTownSchema не отработал:", e);
  }
}

/**
 * Шаблон — ратуша? По meta.effect: угадывания по имени намеренно нет
 * (см. buildingEffect.ts), иначе старая постройка молча забрала бы зону.
 */
export async function isTownHallTemplate(templateId: string | null): Promise<boolean> {
  if (!templateId) return false;
  const rows = (await mcpExec(
    `SELECT (meta->>'effect') = 'town_hall' AS is_hall
       FROM yuplink.mystic_item_template WHERE id = ${sqlStr(templateId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ is_hall: boolean | null }>;
  return rows?.[0]?.is_hall === true;
}

/**
 * Клетка — ратуша? Учитывает и meta шаблона, и override клетки через
 * `building_config.effect` (админ в режиме бога назначает эффект прямо
 * клетке — так «Храм»/«Обычная постройка» становится ратушей без правки
 * общего шаблона). Раньше проверялся только шаблон, и сохранение конфига
 * такой клетки падало с town.not_a_hall.
 */
export async function isCellTownHall(mapId: string, q: number, r: number): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT c.building_config AS cfg, t.meta AS meta
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
      LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ cfg: unknown; meta: unknown }>;
  const row = rows?.[0];
  if (!row) return false;
  const cfgEffect = (row.cfg as { effect?: unknown } | null)?.effect;
  if (cfgEffect === "town_hall") return true;
  const metaEffect = (row.meta as { effect?: unknown } | null)?.effect;
  return metaEffect === "town_hall";
}

/**
 * Отвязать лавки от ушедшей ратуши: иначе они числились бы за городом,
 * которого нет, и после новой ратуши на той же клетке молча к ней прилипли бы.
 */
async function unbindShops(mapId: string, hallQ: number, hallR: number): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_market_shop SET town_q = NULL, town_r = NULL, updated_at = now()
      WHERE map_id = ${sqlStr(mapId)} AND town_q = ${hallQ} AND town_r = ${hallR};`,
    { wrapJson: false },
  );
}

/** Что стояло на клетке ДО правки. Смотрим ПЕРЕД апсертом — иначе снятие
 *  ратуши не отличить от подмены её другой постройкой. */
export async function readCellBuildingId(
  mapId: string,
  q: number,
  r: number,
): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT building_id FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ building_id: string | null }>;
  return rows?.[0]?.building_id ?? null;
}

/** То же, но пачкой: один запрос на все клетки, где меняется постройка. */
export async function readOldBuildings(
  mapId: string,
  cells: Array<{ q: number; r: number }>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (cells.length === 0) return out;
  const pairs = cells.map((c) => `(${c.q}, ${c.r})`).join(",");
  const rows = (await mcpExec(
    `SELECT q, r, building_id FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)} AND (q, r) IN (${pairs});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number; building_id: string | null }>;
  for (const r of rows ?? []) out.set(`${Number(r.q)},${Number(r.r)}`, r.building_id ?? null);
  return out;
}

/** Занести ратушу в реестр (или обновить updated_at). Идемпотентно. */
async function registerHall(mapId: string, q: number, r: number): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.raid_town (map_id, q, r, config, created_at, updated_at)
      VALUES (${sqlStr(mapId)}, ${q}, ${r}, '{}'::jsonb, now(), now())
      ON CONFLICT (map_id, q, r) DO UPDATE SET updated_at = now();`,
    { wrapJson: false },
  );
}

/** Убрать ратушу из реестра. Привязанные лавки — отдельно (unbindShops). */
async function unregisterHall(mapId: string, q: number, r: number): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.raid_town
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r};`,
    { wrapJson: false },
  );
}

/**
 * Смена постройки на клетке: занести ратушу в реестр или убрать из него.
 *
 * Вызывается ПОСЛЕ апсерта клетки (новое building_id уже в базе). Возвращает
 * changed: по нему вызывающий решает, слать ли клиентам publishRaid.
 */
export async function handleBuildingChange(
  mapId: string,
  q: number,
  r: number,
  oldBuildingId: string | null,
  newBuildingId: string | null,
): Promise<{ changed: boolean }> {
  // wasHall: если запись в raid_town уже была — клетка считалась ратушей
  // независимо от источника (шаблон или override клетки), это самый честный
  // источник «было». Плюс запасом проверяем и по старому шаблону — на случай
  // рассинхрона (регистр отстал).
  const registered = (await mcpExec(
    `SELECT 1 FROM yuplink.raid_town WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ "?column?": number }>;
  const wasHall =
    registered.length > 0 || (oldBuildingId ? await isTownHallTemplate(oldBuildingId) : false);
  // isHall: реальное состояние клетки ПОСЛЕ апсерта — учитывает и meta
  // шаблона, и override клетки (building_config.effect). Раньше смотрели
  // только на шаблон, и клетка с override молча оставалась «не ратушей».
  const isHall = newBuildingId ? await isCellTownHall(mapId, q, r) : false;
  if (!wasHall && !isHall) return { changed: false };
  await ensureTownSchema();
  if (wasHall && !isHall) {
    await unregisterHall(mapId, q, r);
    await unbindShops(mapId, q, r);
    return { changed: true };
  }
  if (isHall && !wasHall) {
    await registerHall(mapId, q, r);
    return { changed: true };
  }
  // Ту же ратушу заменили той же ратушей — реестр просто обновим.
  await registerHall(mapId, q, r);
  return { changed: false };
}

/**
 * Id всех ратуш карты (координаты). Нужен pack-у: массив индексов клеток
 * с ратушами уходит клиенту для будущего окна города (этапы 4–6).
 */
export async function loadTownHallIds(mapId: string): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_town WHERE map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  return new Set((rows ?? []).map((x) => `${Number(x.q)},${Number(x.r)}`));
}
