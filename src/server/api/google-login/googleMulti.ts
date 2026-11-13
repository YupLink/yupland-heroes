// Возможные мультиаккаунты для админки (владелец, 06.11.2026: «отслеживание мультиков»):
// разные аккаунты с одного устройства, одного браузера и адреса сети или одного адреса —
// по журналам входа через Google и по кошельку вместе. За 90 дней. Только чтение.
import { mcpExec } from "../../db/mcpClient";

export type MultiGroup = { by: "device" | "fp" | "ip"; who: string[] };

export const MULTI_SQL = `WITH l AS (
    SELECT COALESCE(g.email, 'google ' || gl.tg_id) AS who, gl.tg_id, gl.device, gl.fp, gl.ip
      FROM yuplink.google_login_log gl
      LEFT JOIN yuplink.account_google g ON g.sub = gl.sub
     WHERE gl.at > now() - interval '90 days'
    UNION
    SELECT wallet, tg_id, device, fp, ip FROM yuplink.wallet_login_log
     WHERE at > now() - interval '90 days')
  SELECT 'device' AS by, array_agg(DISTINCT who ORDER BY who) AS who
    FROM l WHERE device IS NOT NULL GROUP BY device HAVING count(DISTINCT tg_id) > 1
  UNION ALL
  SELECT 'fp', array_agg(DISTINCT who ORDER BY who)
    FROM l WHERE fp IS NOT NULL AND ip IS NOT NULL GROUP BY fp, ip HAVING count(DISTINCT tg_id) > 1
  UNION ALL
  SELECT 'ip', array_agg(DISTINCT who ORDER BY who)
    FROM l WHERE ip IS NOT NULL GROUP BY ip HAVING count(DISTINCT tg_id) > 1
  LIMIT 200`;

export async function multiGroups(): Promise<MultiGroup[]> {
  const rows = (await mcpExec(MULTI_SQL, { wrapJson: true })) as Array<Record<string, unknown>>;
  return (rows ?? []).map((r) => ({
    by: r.by === "device" || r.by === "fp" ? r.by : "ip",
    who: Array.isArray(r.who) ? r.who.filter((x): x is string => typeof x === "string") : [],
  }));
}
