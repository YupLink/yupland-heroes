// Раскладка игроков и список добытого по карте — одна на всех, из кэша.
//
// Оба запроса не зависят от того, кто спрашивает (себя и купол вычитает
// players.ts уже из готового ответа), а спрашивают их все клиенты раз в минуту
// и после каждого события без координат. Две секунды свежести незаметны глазу
// (точки соседей и так едут по клетке за раз), а базе это экономит сотни
// тяжёлых GROUP BY в секунду при тысяче игроков.
//
// Снимок помнит, ГДЕ он видел каждый аккаунт (`at`). Себя игрок вычитает по
// этой карте, а не по своей текущей клетке: между снимком и ответом он успевает
// шагнуть, и вычитание «по текущей» оставляло его же лагерь на пройденной
// клетке — «тень на шаг позади» (20.09). Наружу `at` не уходит — только серверу.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { swrCache } from "../../cache/swr";
import { POS_MAP_SQL } from "./pos-map-sql";
import { RECENTLY_SEEN_SQL } from "../account-seen";

export type SharedPlayers = {
  cells: Array<{ q: number; r: number; count: number }>;
  /** account_id → «q,r»: где снимок видел каждого. */
  at: Map<string, string>;
  dead: Array<{ q: number; r: number; cycle_no: number; expired: boolean }>;
};

const TTL_MS = 2_000;

async function load(mapId: string): Promise<SharedPlayers> {
  const m = sqlStr(mapId);
  const [rows, dead] = await Promise.all([
    mcpExec(
      `SELECT p.q, p.r, count(*) AS players, array_agg(p.account_id) AS accounts
         FROM yuplink.beta_raid_positions p
        -- только соседи по ЭТОЙ карте (мультикарта); пустая карта — главный мир.
        WHERE ${POS_MAP_SQL("p")} = ${m}
          -- лагерь того, кто не заходил 7 дней, другим не показываем (15.10).
          AND ${RECENTLY_SEEN_SQL("p")}
        GROUP BY p.q, p.r;`,
      { wrapJson: true },
    ) as Promise<Array<{ q: number; r: number; players: number; accounts: unknown }>>,
    mcpExec(
      `SELECT h.q, h.r, h.cycle_no,
              (h.killed_at IS NOT NULL AND h.killed_at < now() - interval '5 seconds') AS expired
         FROM yuplink.beta_raid_object_hp h
        WHERE h.map_id = ${m}
          AND h.cycle_no IN (0, 1)
          AND (h.killed_at IS NOT NULL OR h.current_hp <= 0);`,
      { wrapJson: true },
    ) as Promise<Array<{ q: number; r: number; cycle_no: number; expired: boolean }>>,
  ]);
  const at = new Map<string, string>();
  const cells = (rows ?? []).map((r) => {
    const q = Number(r.q);
    const rr = Number(r.r);
    // row_to_json отдаёт array_agg JSON-массивом строк (как cells в dead-sweep).
    if (Array.isArray(r.accounts)) for (const a of r.accounts) at.set(String(a), `${q},${rr}`);
    return { q, r: rr, count: Number(r.players) };
  });
  return {
    cells,
    at,
    dead: (dead ?? []).map((r) => ({
      q: Number(r.q),
      r: Number(r.r),
      cycle_no: Number(r.cycle_no),
      expired: r.expired === true,
    })),
  };
}

// maxStale = ttl нарочно: протухшее старше 2 с НЕ отдаётся, читатель ждёт одну
// общую загрузку (swr дедуплицирует ожидающих). Запрос стоит доли миллисекунды,
// а снимок 10-секундной давности откатывал точки соседей, уже сдвинутые живым
// потоком (moved), на пройденные клетки до следующего опроса.
const cache = swrCache<SharedPlayers>({ ttl: TTL_MS, load, maxStale: TTL_MS });

/** Раскладка игроков и добытое по карте — свежее не старше 2 с. */
export const sharedPlayers = (mapId: string): Promise<SharedPlayers> => cache.get(mapId);
