// Сколько ещё держит замок шахтёра на шахте (mine-ward-sql). Сбой чтения —
// бросок: захват не пройдёт мимо замка из-за упавшего запроса.
import { mcpExec } from "@/server/db/mcpClient";
import { wardLeftSql } from "./mine-ward-sql";

/** Остаток живого замка, мс; замка нет — 0. */
export async function mineWardLeft(mapId: string, q: number, r: number): Promise<number> {
  const rows = (await mcpExec(wardLeftSql({ mapId, q, r }), { wrapJson: true })) as Array<{
    leftMs: unknown;
  }> | null;
  const left = Number(rows?.[0]?.leftMs);
  return Number.isFinite(left) && left > 0 ? Math.ceil(left) : 0;
}
