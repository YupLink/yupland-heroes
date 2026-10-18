// Корабли в режиме бога: спустить судно на клетку и убрать его оттуда.
//
// Жили эти две ручки в admin-live-edit.ts, но там правятся СЛОИ КЛЕТКИ
// (raid_map_cells), а корабль — своя таблица со своим экипажем. Разъехались,
// заодно вернув соседа под лимит в 250 строк.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { godMapId } from "./god-map";
import { shipMaxHp } from "@/lib/shipHealth";
import { WATER_SQL } from "./ships";
import { publishRaid } from "../../raidLive";

const cell = { q: z.number().int(), r: z.number().int() };

/** «Корабля здесь нет» — с уточнением, какого именно просили. */
const noShipText = (kind?: "small" | "big") =>
  kind === "big"
    ? "Большого корабля здесь нет или он занят игроком"
    : kind === "small"
      ? "Малого корабля здесь нет или он занят игроком"
      : "Корабля здесь нет или все заняты игроками";

/**
 * Спустить корабль вручную — тем, кто застрял, и просто по-доброму.
 *
 * Проверка воды раньше была отдельным походом в базу, и «спустить корабль»
 * стоило три запроса подряд. Теперь условие живёт внутри самой вставки: нет
 * воды под клеткой — INSERT не вставит ни строки, и это же и есть отказ.
 */
export const adminPlaceShip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ...cell, kind: z.enum(["small", "big"]).default("small") }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    const rows = (await mcpExec(
      // Полный запас хода: у большого судна он вдвое больше малого.
      `INSERT INTO yuplink.beta_raid_ship (id, map_id, q, r, owner, kind, hp)
       SELECT ${sqlStr(`ship_${nanoid(10)}`)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, 'admin',
              ${sqlStr(data.kind)}, ${shipMaxHp(data.kind === "big" ? "big" : "small")}
         FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${data.q} AND c.r = ${data.r}
          AND ${WATER_SQL}
       RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!rows?.[0]?.id) throw new Error("Корабль ставится только на воду");
    publishRaid({ mapId, type: "ships" });
    return { ok: true as const, id: rows[0].id };
  });

/**
 * Убрать корабль (один из стоящих здесь) — только СВОБОДНЫЙ.
 *
 * `kind` задаёт ЧТО именно убирать: большой или обычный. Раньше сервер
 * удалял «самое новое свободное» — на смешанной клетке админ жал «убрать
 * большой», а падал первый попавший, и в UI оставалась чужая иконка.
 *
 * ⚠️ Почему тут ДВА запроса, а не один красивый `WITH gone AS (DELETE …)`.
 * Postgres пускает изменяющий CTE только на ВЕРХНЕМ уровне запроса, а
 * mcpExec с wrapJsonCte сам оборачивает наш SQL ещё одним WITH (ради
 * row_to_json). Свой WITH внутри обёртки оказывался вложенным, и кнопка
 * «убрать» падала с «WITH clause containing a data-modifying statement must
 * be at the top level» (та же грабля описана в energy-packs-admin.ts).
 * Теперь верхним уровнем идёт сам DELETE — обёртка ему только рада.
 *
 * Второй повод разделить: мост повторяет запрос ВСЛЕПУЮ (контракт в
 * mcpClient). «Удали самое новое свободное» на повторе снесло бы ВТОРОЕ
 * судно, поэтому жертву сначала пиним по id, а удаляем уже по нему: повтор
 * не находит ничего и никого лишнего не топит.
 *
 * Возвращаем пост-состояние клетки: `remainingBig` — остался ли большой ещё
 * на этой клетке. Клиент правит `big`-флаг в кэше и рисует ровно тот арт,
 * что теперь в БД. Себя удаляемый в этот счёт не берёт (`o.id <> s.id`):
 * подзапрос видит снимок ДО удаления и иначе считал бы утопленника живым.
 */
export const adminRemoveShip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ...cell, kind: z.enum(["small", "big"]).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    const at = (alias: string) =>
      `${alias}.map_id = ${sqlStr(mapId)} AND ${alias}.q = ${data.q} AND ${alias}.r = ${data.r}`;
    const remainingBigSql = (extra: string) =>
      `SELECT bool_or(o.kind = 'big') FROM yuplink.beta_raid_ship o WHERE ${at("o")}${extra}`;

    // У причала может стоять несколько судов — убираем по одному за нажатие,
    // ИМЕННО того вида, что попросил админ. Без kind — старое поведение
    // (первое свободное), на случай если где-то ещё зовут без вида.
    const kindFilter = data.kind ? ` AND s.kind = ${sqlStr(data.kind)}` : "";
    const pick = (await mcpExec(
      `SELECT s.id, s.kind FROM yuplink.beta_raid_ship s
        WHERE ${at("s")} AND s.crew_account IS NULL${kindFilter}
        ORDER BY s.created_at DESC LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ id: string; kind: string | null }>;
    const target = pick?.[0];
    if (!target?.id) throw new Error(noShipText(data.kind));

    const gone = (await mcpExec(
      `DELETE FROM yuplink.beta_raid_ship s
        WHERE s.id = ${sqlStr(target.id)} AND s.crew_account IS NULL
        RETURNING s.id, s.kind, (${remainingBigSql(" AND o.id <> s.id")}) AS remaining_big;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string; kind: string | null; remaining_big: boolean | null }>;

    if (!gone?.[0]?.id) {
      // Ноль строк — либо наш же слепой повтор (судно уже снято первой
      // попыткой), либо игрок сел за руль между пином и удалением. Разбирает
      // одна проверка: строка на месте — значит с капитаном, и это отказ.
      const after = (await mcpExec(
        `SELECT EXISTS(SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.id = ${sqlStr(target.id)}) AS still,
                (${remainingBigSql("")}) AS remaining_big;`,
        { wrapJson: true },
      )) as Array<{ still: boolean | null; remaining_big: boolean | null }>;
      if (after?.[0]?.still) throw new Error(noShipText(data.kind));
      publishRaid({ mapId, type: "ships" });
      return {
        ok: true as const,
        id: target.id,
        big: target.kind === "big",
        remainingBig: !!after?.[0]?.remaining_big,
      };
    }

    publishRaid({ mapId, type: "ships" });
    return {
      ok: true as const,
      id: gone[0].id,
      big: gone[0].kind === "big",
      remainingBig: !!gone[0].remaining_big,
    };
  });
