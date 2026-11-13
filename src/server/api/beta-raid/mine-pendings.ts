// Мои шахты с накопленной добычей — для плашки сбора над картой рейда.
// Отдаём секундомер (captured_at) + claimed_hours + выход, клиент считает
// накопление сам (живо тикает, как накопление лайков в стейке). Доступно всем:
// у кого нет своих захваченных шахт — вернётся пусто.
//
// Шахты v2 (§8.59): секундомер, выход и предел часов подставлены так, что
// клиентский livePendingAmount считает добычу v2 (lib/mineV2Row.ts); в поле v2
// — режим и запас службы. Сломанная v2 копит только до поломки, а через минуту
// обход снимает её из владения (накопленное начисляется хозяину). Шахта острова
// (флаг клетки) — свой стандарт и шаг выплаты (алмаз — целые сутки, stepHours).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet } from "../../auth";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import type { MineResource } from "@/lib/buildingEffect";
import { mushroomKindOf, type MushroomKind } from "@/lib/mushroomKinds";
import { mineV2Of } from "@/lib/mineV2";
import { mineV2Life, mineV2PendingArgs, type MineV2Life } from "@/lib/mineV2Row";
import { islandSql, mineClockSql, v2ColsSql, type V2Cols } from "./mine-v2-sql";
import { mineWeatherOf, type MineWeather } from "@/lib/mineWeather";

export type MineRow = {
  /** Карта шахты: в «Добыче» шахты со всех этажей сразу. */
  mapId: string;
  /** Название ДРУГОГО этажа (не того, где стоит игрок); свой — null. */
  floor?: string | null;
  q: number;
  r: number;
  /** Гриб использует тот же сбор, но имеет своё имя, облик и срок жизни. */
  mushroom?: { kind: MushroomKind; image: string | null; diesAt: number | null } | null;
  resource: MineResource;
  token: string | null;
  yield: number;
  claimedHours: number;
  capturedAt: number;
  /** Предел часов добычи (лесопилка острова — неделя; v2 — до поломки); null — без предела. */
  maxHours: number | null;
  /** Шаг выплаты, часов (алмаз острова — 24); нет — каждый час. */
  stepHours?: number;
  /** Шахта v2: режим и запас службы; нет — шахта старого образца. */
  v2?: MineV2Life | null;
  /** Шахта острова новичка (флаг клетки): только «Бережно», режим не меняют. */
  island?: boolean;
  /** Шахта v2: слоты погоды несобранной части (lib/mineWeather); нет — погода не влияет. */
  weather?: MineWeather | null;
  /**
   * Отнятая шахта или гриб (§8.71, mine-capture-log): строка журнала и сколько
   * ждёт сбора; выхода в час нет. Собирается «Собрать со всех шахт».
   */
  lost?: { id: string; amount: number; kind?: string } | null;
};

/** Настроенные шахты, которыми владеет аккаунт на карте (для клейма/показа). */
export async function ownedMineRows(mapId: string, account: string): Promise<MineRow[]> {
  const rows = (await mcpExec(
    `SELECT s.q, s.r, s.claimed_hours,
            ${mineClockSql("s")} AS cap,
            c.building_config AS mushroom_config, sk.image AS mushroom_image,
            c.building_config->>'resource' AS resource,
            c.building_config->>'token'    AS token,
            (c.building_config->>'yield')::numeric AS yield,
            (c.building_config->>'maxHours')::numeric AS max_hours,
            ${islandSql("c.building_config")} AS island,
            ${v2ColsSql("s", "c.building_config")}
       FROM yuplink.raid_mine_state s
       JOIN yuplink.raid_map_cells c ON c.map_id=s.map_id AND c.q=s.q AND c.r=s.r
       LEFT JOIN yuplink.raid_building_skin sk ON sk.id=c.building_skin_id
      WHERE s.map_id=${sqlStr(mapId)} AND s.owner_account=${sqlStr(account)}
        AND (c.building_config->>'resource') IS NOT NULL
        AND (COALESCE((c.building_config->>'yield')::numeric,0) > 0
             OR yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL);`,
    { wrapJson: true },
  ).catch(() => [])) as Array<
    V2Cols & {
      q: number;
      r: number;
      claimed_hours: number;
      cap: number;
      mushroom_config: unknown;
      mushroom_image: string | null;
      resource: string;
      token: string | null;
      yield: number;
      max_hours: number | null;
      island: boolean | null;
    }
  >;
  return (rows ?? []).map((x) => {
    const mushroom = mushroomKindOf(x.mushroom_config);
    const diesAt = Date.parse(String((x.mushroom_config as { diesAt?: unknown } | null)?.diesAt ?? ""));
    const row: MineRow = {
      ...(mushroom ? { mushroom: { kind: mushroom, image: x.mushroom_image ?? null, diesAt: Number.isFinite(diesAt) ? diesAt : null } } : {}),
      mapId,
      q: Number(x.q),
      r: Number(x.r),
      resource: x.resource as MineResource,
      token: x.token ?? null,
      yield: Number(x.yield) || 0,
      claimedHours: Number(x.claimed_hours) || 0,
      capturedAt: Number(x.cap) || 0,
      maxHours: Number(x.max_hours) > 0 ? Number(x.max_hours) : null,
    };
    const kind = x.v2_std != null && x.v2_accrue != null ? mineV2Of(x) : null;
    if (!kind) return row;
    const life = mineV2Life({ mode: x.v2_mode, lifeLeft: x.v2_life_left, lifeAtMs: x.v2_life_at });
    const live = mineV2PendingArgs({
      resource: kind,
      mode: life.mode,
      accrueFromMs: Number(x.v2_accrue),
      breakAt: life.breakAt,
      island: x.island === true,
      // Стандарт базы — с уровнем шахты (§8.74).
      std: Number(x.v2_std),
    });
    const weather = mineWeatherOf(x.v2_weather);
    return {
      ...row,
      ...live,
      v2: life,
      ...(x.island === true ? { island: true } : {}),
      ...(weather ? { weather } : {}),
    };
  });
}

export const getMyMinePendings = createServerFn({ method: "GET" }).handler(
  async (): Promise<MineRow[]> => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return [];
    const mapId = await myMapId(wallet).catch(() => null);
    if (!mapId) return [];
    return ownedMineRows(mapId, account);
  },
);
