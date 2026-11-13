// Обряд шамана в метеостанции (владелец, 28.10.2026; migrations/weather-04-ritual).
// Шаман из хижины тратится и даёт +3 % тому, что выбрал игрок, на ближайшую смену
// погоды этого мира. Всё решает одна функция базы raid_weather_ritual: один обряд с
// аккаунта в каждом мире за смену (weather-05), шаман списывается в той же транзакции,
// повтор того же opId — «ok» без второго шамана.
//
// ritualState — для окна: голоса каждого мира в эту смену, свой обряд и шаманы в хижине.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { actionGate } from "@/server/rateGate";
import {
  RITUAL_TARGETS,
  isRitualTarget,
  type RitualTarget,
  type RitualVotes,
} from "@/lib/raid/weatherRitual";
import { requireWeatherStation, stationAccount } from "./wstation-own";

/** Мир из окна станции (тот же отбор, что raid_weather_tick); иначе шаман ушёл бы в мир без окна. */
async function isStationWorld(mapId: string): Promise<boolean> {
  const { weatherWorldsSql } = await import("./wstation-list");
  const rows = ((await mcpExec(weatherWorldsSql, { wrapJson: true })) ?? []) as Array<{
    hidden?: boolean;
    id: string;
  }>;
  return rows.some((r) => r.id === mapId && r.hidden !== true);
}

export type RitualState = {
  /** Голоса в эту смену: мир → за что → сколько. */
  votes: Record<string, RitualVotes>;
  /** Свои обряды в эту смену: мир → за что (в каждом мире — один). */
  mine: Record<string, RitualTarget>;
  /** Шаманов в хижине. */
  shamans: number;
};

type VoteRow = { map_id: string; target: string; n: number; mine: boolean };

/** Голоса текущей смены и шаманы аккаунта; таблиц ещё нет — пусто, окно не падает. */
export async function ritualState(account: string): Promise<RitualState> {
  const state: RitualState = { votes: {}, mine: {}, shamans: 0 };
  try {
    const rows = ((await mcpExec(
      `SELECT v.map_id, v.target, count(*)::int AS n, bool_or(v.account_id = ${sqlStr(account)}) AS mine
         FROM yuplink.raid_weather_vote v
        WHERE v.slot_at = yuplink.raid_weather_slot(now())
        GROUP BY v.map_id, v.target`,
      { wrapJson: true },
    )) ?? []) as VoteRow[];
    for (const r of rows) {
      if (!isRitualTarget(r.target)) continue;
      (state.votes[r.map_id] ??= {})[r.target] = Number(r.n) || 0;
      if (r.mine) state.mine[r.map_id] = r.target;
    }
  } catch (e) {
    console.warn("[wstation] голоса:", e instanceof Error ? e.message : e);
  }
  try {
    const rows = (await mcpExec(
      `SELECT COALESCE((SELECT s.count FROM yuplink.castle_shaman s
                         WHERE s.account_id = ${sqlStr(account)}), 0)::int AS n`,
      { wrapJson: true },
    )) as Array<{ n: number }> | null;
    state.shamans = Number(rows?.[0]?.n) || 0;
  } catch (e) {
    console.warn("[wstation] шаманы:", e instanceof Error ? e.message : e);
  }
  return state;
}

/** Отказ базы → ключ перевода (humanError). */
const REFUSAL: Record<string, string> = {
  bad_target: "wstation.ritual_cannot",
  cannot: "wstation.ritual_cannot",
  no_weather: "wstation.ritual_no_weather",
  too_late: "wstation.ritual_too_late",
  already: "wstation.ritual_already",
  no_shaman: "wstation.ritual_no_shaman",
};

const input = z
  .object({
    mapId: z.string().min(1).max(128),
    target: z.enum(RITUAL_TARGETS),
    opId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .strict();

export const castWeatherRitual = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const account = await stationAccount();
    await actionGate("weather-ritual", account);
    await requireWeatherStation(account);
    if (!(await isStationWorld(data.mapId))) throw new Error("wstation.ritual_no_weather");
    const rows = (await mcpExec(
      `SELECT yuplink.raid_weather_ritual(${sqlStr(account)}, ${sqlStr(data.mapId)},
              ${sqlStr(data.target)}, ${sqlStr(data.opId)}) AS res`,
      { wrapJson: true },
    )) as Array<{ res: string }> | null;
    const res = rows?.[0]?.res;
    if (res === "ok") return { ok: true };
    throw new Error(REFUSAL[res ?? ""] ?? "wstation.ritual_failed");
  });
