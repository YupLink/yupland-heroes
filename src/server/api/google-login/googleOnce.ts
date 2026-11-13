// Токен Google — одноразовый (перед открытием входа всем, 06.11.2026). ID-токен живёт
// около часа: перехваченный (лог, расширение, чужой экран) иначе впускал бы повторно.
// Метка — sha256 токена в login_challenges (purpose 'google', сразу consumed: вызовы
// подписи NEP-413 её не берут), до истечения токена; старое чистит issueLoginChallenge.
import { createHash } from "node:crypto";
import { mcpExec } from "../../db/mcpClient";

/** true — токен пришёл впервые; false — уже был (повтор). */
export async function consumeGoogleToken(credential: string, expS: number): Promise<boolean> {
  const mark = `g:${createHash("sha256").update(credential).digest("base64url")}`;
  const until = Math.trunc(expS) + 60;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.login_challenges (nonce, expires_at, consumed, purpose)
     VALUES ('${mark}', to_timestamp(${until}), true, 'google')
     ON CONFLICT (nonce) DO NOTHING
     RETURNING nonce`,
    { wrapJsonCte: true },
  )) as Array<{ nonce: string }>;
  return rows.length > 0;
}
