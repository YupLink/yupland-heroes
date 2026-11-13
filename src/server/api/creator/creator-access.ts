// Режим бога креатора (island-editor-auth): право creator и работа, своя или
// открытая ему НА РЕДАКЦИЮ, где он стоит (открытая только на просмотр — без
// правки, владелец 07.11.2026). Старые карты креатору закрыты — здесь только
// карты работ (isle_cw_…).
import { mcpExec } from "@/server/db/mcpClient";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { walletHasRight } from "@/server/admin-rights";
import { workEditSql } from "./creator-sql";

/** Может ли кошелёк править эту работу: право creator + автор или роль «правка». */
export async function creatorCanEdit(wallet: string, mapId: string): Promise<boolean> {
  if (!isCreatorMapId(mapId) || !(await walletHasRight(wallet, "creator"))) return false;
  const { accountOf } = await import("@/server/api/user-shared");
  const account = await accountOf(wallet).catch(() => null);
  if (!account) return false;
  const rows = (await mcpExec(workEditSql(mapId, account), { wrapJson: true }).catch(
    () => [],
  )) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}
