// Грядка: поле, на котором работают ГЕРОИ игроков.
//
// Отличие от шахты: поле не захватывают и не отбирают. Игрок ставит на него
// своего героя, и с этого часа поле кормит. Пришёл второй игрок со своим
// героем — часовая добыча делится поровну: было 1 пшеница в час, стало по 0,5
// каждому. Ушёл — доли снова пересчитались.
//
// Собирают ТОЛЬКО целые единицы: 2,7 пшеницы — это две в руки, а 0,7 остаётся
// копиться дальше. Учёт долей ведут SQL-функции raid_field_* (миграция
// scripts/migrate-fields-2026-09.sql): любая смена состава закрывает отрезок
// всем сразу, поэтому доля всегда считается по реальному числу работников.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, ownCell } from "./encounter-where";
import { areNeighbors } from "./helpers";
import { loadCellBuilding } from "./building-action";
import { accAccountId } from "../currency/move";
import { isBuilt } from "@/lib/buildingEffect";
import { heroFitsField, parseFieldConfig } from "@/lib/fieldConfig";
import { publishRaid } from "../../raidLive";
import { fieldHeroes, guardedJoinSql, requireOwnHero } from "./field-heroes";
import { settleFieldPayout } from "./field-settle";
import { leaveFieldWork } from "./field-leave";
import { sqlRow } from "./chest/chest-row";

const cell = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Поле на этой клетке, игрок рядом, конфиг задан. Иначе — отказ. */
async function fieldAt(wallet: string, mapId: string, q: number, r: number) {
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "field") throw new Error("Это не грядка");
  if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Грядка ещё не готова");
  const cfg = parseFieldConfig(b.config) ?? parseFieldConfig(b.meta);
  if (!cfg) throw new Error("Грядка не настроена — добыча не задана");
  const pos = await ownCell(wallet);
  const near = !!pos && (areNeighbors(pos.q, pos.r, q, r) || (pos.q === q && pos.r === r));
  if (!near) throw new Error("Сначала подойди к грядке");
  return { b, cfg };
}

type WorkerRow = { account_id: string; hero_id: string | null; hero_name: string | null };

/** Кто сейчас работает на поле (и мой ли это герой). */
export async function fieldWorkers(mapId: string, q: number, r: number): Promise<WorkerRow[]> {
  const rows = (await mcpExec(
    `SELECT w.account_id, w.hero_id,
            COALESCE(NULLIF(t.name, ''), 'Герой') AS hero_name
       FROM yuplink.raid_field_worker w
       LEFT JOIN yuplink.hero_instance h ON h.id = w.hero_id
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE w.map_id = ${sqlStr(mapId)} AND w.q = ${q} AND w.r = ${r}
        AND w.hero_id IS NOT NULL;`,
    { wrapJson: true },
  ).catch(() => [])) as WorkerRow[];
  return rows ?? [];
}

/** Окно грядки: что растёт, кто работает, что накопилось и кого можно поставить. */
export const getFieldState = createServerFn({ method: "GET" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const { b, cfg } = await fieldAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    // Урожай сам уходит на ближайший склад (ленивый сеттл при открытии окна) —
    // ручного сбора у полей больше нет, пендинга игрок не видит.
    await settleFieldPayout(mapId, data.q, data.r, cfg).catch(() => {});

    const [workers, heroes] = await Promise.all([
      fieldWorkers(mapId, data.q, data.r),
      fieldHeroes(wallet, mapId),
    ]);
    const mineRow = workers.find((w) => w.account_id === account) ?? null;
    return {
      name: b.name,
      reward: cfg.reward,
      requirements: {
        rarities: cfg.rarities,
        levelMode: cfg.levelMode,
        levelFrom: cfg.levelFrom,
        levelTo: cfg.levelTo,
      },
      /** Часовая добыча поля целиком — делится между работниками. */
      yieldAmount: cfg.yield,
      workers: workers.length,
      /** Лимит работников (0 — без лимита). Первая цифра значка — занято
       *  (workers): клиент красит красным при полном, зелёным — если есть место. */
      maxHeroes: cfg.maxHeroes,
      /** Моя доля в час прямо сейчас. */
      share: workers.length > 0 ? cfg.yield / workers.length : cfg.yield,
      myHero: mineRow ? { id: mineRow.hero_id ?? "", name: mineRow.hero_name ?? "Герой" } : null,
      // Показываем ТОЛЬКО тех, кто проходит по требованиям поля: список «кого
      // нельзя» игроку ничего не даёт, кроме раздражения.
      heroes: heroes.filter((h) => heroFitsField(cfg, h)),
    };
  });

/**
 * Занятость полей с лимитом — для значка над зданием на карте (как у кораблей).
 * Отдаём только поля, где лимит задан (maxHeroes > 0): у безлимитных считать
 * «занято/всего» не из чего. Клетка → { used, max }. Первая цифра — ЗАНЯТО
 * (сколько героев уже работает); цвет решает клиент: полно — красным, есть
 * место — зелёным.
 */
export const getFieldSlots = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const mapId = await myMapId(wallet);
  const rows = (await mcpExec(
    `SELECT c.q, c.r,
            (c.building_config->'field'->>'maxHeroes')::int AS maxh,
            COALESCE(w.n, 0) AS used
       FROM yuplink.raid_map_cells c
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS n FROM yuplink.raid_field_worker fw
          WHERE fw.map_id = c.map_id AND fw.q = c.q AND fw.r = c.r AND fw.hero_id IS NOT NULL
       ) w ON true
      WHERE c.map_id = ${sqlStr(mapId)} AND c.building_config ? 'field'
        AND COALESCE((c.building_config->'field'->>'maxHeroes')::int, 0) > 0;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number; maxh: number; used: number }>;
  const slots: Record<string, { used: number; max: number }> = {};
  for (const r of rows ?? []) {
    const max = Number(r.maxh) || 0;
    if (max <= 0) continue;
    slots[`${r.q},${r.r}`] = { used: Math.max(0, Number(r.used) || 0), max };
  }
  return { slots };
});

/** Поставить героя работать. Повторный вызов меняет героя, а не плодит второго. */
export const placeHeroOnField = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), heroId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const { cfg } = await fieldAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
    // requireOwnHero будит спящего героя и возвращает НАСТОЯЩИЙ id: дальше в
    // raid_field_join уходит он, а не ссылка «wake:<шаблон>» из списка.
    const hero = await requireOwnHero(wallet, data.heroId);
    // Требования поля проверяет сервер: список на клиенте отфильтрован, но
    // присланный id — это всё ещё слово игрока.
    if (!heroFitsField(cfg, hero)) throw new Error("braid.field_hero_unfit");

    // Лимит работников (0 — без лимита). Свой аккаунт уже на поле — это СМЕНА
    // героя, а не новый работник, её лимит не трогает.
    if (cfg.maxHeroes > 0) {
      const workers = await fieldWorkers(mapId, data.q, data.r);
      const already = workers.some((w) => w.account_id === account);
      if (!already && workers.length >= cfg.maxHeroes) throw new Error("braid.field_full");
    }

    try {
      // Основной и отдыхающий не батрачат — условие в самом операторе: между
      // проверкой выше и постановкой героя могли сделать основным (вторая
      // вкладка) или отправить отдыхать (снятие с другой грядки издалека).
      const join = { mapId, q: data.q, r: data.r, account, wallet, heroId: hero.id };
      const res = sqlRow<{ joined: number }>((await mcpExec(guardedJoinSql(join))) as unknown[]);
      if (!(Number(res?.joined) > 0)) {
        // Назовём причину: перечитаем героя (отдыхает или основной). Уже
        // свободен — значит успели между делом, пусть попробует снова.
        await requireOwnHero(wallet, hero.id);
        throw new Error("braid.field_place_retry");
      }
    } catch (e) {
      // Лимит поля пробили гонкой: SQL под локом сказал «полно» (JS-проверка
      // выше — быстрый путь, но у неё окно между чтением и join).
      if (/field_full/i.test(String(e))) throw new Error("braid.field_full");
      // Уникальный индекс по герою: он уже работает на другом поле.
      if (/raid_field_worker_hero_uniq|duplicate key/i.test(String(e))) {
        throw new Error("Этот герой уже работает на другой грядке");
      }
      throw e;
    }
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true as const, heroName: hero.name };
  });

/** Снять героя с поля — бесплатно, стоя рядом.
 *
 * Само снятие и выдача дробного хвоста — общие со снятием издалека
 * (field-leave.ts): снятие там CAS, и два снятия разом не выдадут хвост дважды.
 * Отдыха тут нет: он — цена снятия издалека (ПРАВИЛА §8.16).
 */
export const removeHeroFromField = createServerFn({ method: "POST" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const { cfg } = await fieldAt(wallet, mapId, data.q, data.r);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    const { dust } = await leaveFieldWork({
      wallet,
      account,
      mapId,
      q: data.q,
      r: data.r,
      cfg,
      heroId: null,
      key: null,
    });
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true as const, dustClaimed: dust };
  });

// claimField (ручной сбор урожая) удалён: урожай сам уходит на ближайший склад
// (settleFieldPayout, ленивый сеттл). Сбора по кнопке у полей больше нет.
