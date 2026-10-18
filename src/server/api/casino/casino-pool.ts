// Пул золота казино (владелец, 16.10.2026): сколько казино заработало. Ставка игрока в
// слоте — в пул, выигрыш — из пула (триггер на журнале ресурсов, respool-04). Минус —
// казино в убытке. Админу над картой: всего и за сутки.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { requireAdmin } from "@/server/auth";

export type CasinoGoldPool = { balance: number; day: number };

export const getCasinoGoldPool = createServerFn({ method: "GET" }).handler(
  async (): Promise<CasinoGoldPool> => {
    requireAdmin();
    const rows = ((await mcpExec(
      `SELECT (SELECT balance FROM yuplink.res_pool WHERE resource = 'gold') AS balance,
              (SELECT COALESCE(sum(amount), 0) FROM yuplink.res_pool_move
                WHERE resource = 'gold' AND kind LIKE 'casino:%'
                  AND created_at > now() - interval '1 day') AS day;`,
      { wrapJson: true },
    ).catch(() => [])) ?? []) as Array<{ balance: number | null; day: number | null }>;
    return { balance: Number(rows[0]?.balance ?? 0), day: Number(rows[0]?.day ?? 0) };
  },
);
