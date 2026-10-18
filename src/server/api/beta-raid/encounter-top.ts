// Кто сколько выбил из ЭТОЙ цели — прямо в окне боя.
//
// Награда босса делится по местам, поэтому игрок должен видеть расклад до
// того, как потратит энергию: «Награды · по местам» без таблицы мест читались
// как загадка (жалоба игрока 24.08).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { requireNotVoid } from "./voidGate";
import { requireWallet } from "../../auth";
import { objectLeaderboard } from "./encounter-payout";
import { peekObjectHp } from "./encounter-hp";
import { myMapId } from "./encounter-where";
import { loadEncounterTarget } from "./encounter-target";
import { applyCellOverride, loadCellObject } from "./cell-override";
import { targetFromSnapshot } from "./boss-snapshot";
import { parseRewardConfig } from "../raid-shared";
import { prizesByPlace } from "./encounter-prizes";
import { prizeNames } from "./encounter-prize-names";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/**
 * Показываем ВЕСЬ список: игрок должен видеть и себя, и соседей по местам,
 * даже если он двадцатый. Верхняя граница только страховочная.
 */
const MAX_ROWS = 300;

export const getEncounterTop = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ objectId: z.string().min(1), q: z.number().int(), r: z.number().int() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireBetaRaid();
    const wallet = requireWallet();
    const mapId = await myMapId(wallet);
    // Доска урона выдаёт сам факт цели в зоне, а prizeNames — её награды.
    // Пустой ответ тут не годится: «объекта нет» и «объект за стеной» игрок
    // отличил бы по времени ответа, поэтому отказ такой же, как у боя.
    await requireNotVoid(wallet, mapId, data.q, data.r);

    // Клетку спрашиваем ПЕРВОЙ: доска урона принадлежит слою, а на клетке их
    // теперь два — её объект и спрятавшийся под ним беглец (runners.ts).
    const cell = await loadCellObject(mapId, data.q, data.r);
    const hp = await peekObjectHp({ mapId, q: data.q, r: data.r, layer: cell.layer });
    if (!hp) return { rows: [], myRank: null, myDamage: 0, total: 0 };

    const board = await objectLeaderboard(hp.id, hp.generation);

    // Имя игрока — его ТГ (@username, иначе кошелёк), а не внутренний acc_-id:
    // «acc_fnO…QU_x» в доске урона игрокам ничего не говорил.
    const accs = Array.from(new Set(board.map((r) => r.account).filter(Boolean)));
    const nameByAcc = new Map<string, string>();
    if (accs.length > 0) {
      const nrows = (await mcpExec(
        `SELECT account_id,
                COALESCE(
                  '@' || min(telegram_username) FILTER (WHERE COALESCE(telegram_username,'') <> ''),
                  'id' || (min(telegram_id) FILTER (WHERE telegram_id IS NOT NULL))::text,
                  min(wallet)
                ) AS name
           FROM yuplink.users
          WHERE account_id IN (${accs.map((a) => sqlStr(a)).join(",")})
          GROUP BY account_id;`,
        { wrapJson: true },
      ).catch(() => [])) as Array<{ account_id: string; name: string | null }>;
      // Имя уже готово на сервере: @username, иначе id<telegram_id>, иначе
      // кошелёк (только у совсем старых записей без ТГ).
      for (const r of nrows ?? []) {
        const nm = (r.name ?? "").trim();
        if (nm) nameByAcc.set(r.account_id, nm);
      }
    }

    // Что достанется каждому месту — по тем же формулам, что и раздача.
    const tpl =
      cell.objectId === data.objectId
        ? ((await loadEncounterTarget(data.objectId).catch(() => null)) ??
          targetFromSnapshot(data.objectId, cell.snapshot))
        : null;
    const target = tpl ? applyCellOverride(tpl, cell.override) : null;
    const prizes = target
      ? prizesByPlace(parseRewardConfig(target.rewardConfig), board.length)
      : [];
    const names = await prizeNames(prizes);
    const { raidOwner } = await import("./owner");
    const me = await raidOwner(wallet);

    let myRank: number | null = null;
    let myDamage = 0;
    const rows = board.map((r, i) => {
      const isMe = r.account === me;
      if (isMe && myRank == null) {
        myRank = i + 1;
        myDamage = r.total;
      }
      return {
        place: i + 1,
        wallet: r.account,
        // Отображаемое имя: ТГ игрока; если не привязан — короткий acc-id.
        name: nameByAcc.get(r.account) ?? `${r.account.slice(0, 7)}…${r.account.slice(-4)}`,
        damage: r.total,
        isMe,
        // prize — МАССИВ призов места (значки на клиенте), не строка. Раньше
        // тут был .join(" · ") в строку, а prizeNames уже отдаёт объекты —
        // клиент делал .map по строке и падал («e.map is not a function»).
        prize: (prizes[i] ?? []).map((p) => names(p)),
      };
    });

    return {
      rows: rows.slice(0, MAX_ROWS),
      myRank,
      myDamage,
      total: board.length,
    };
  });
