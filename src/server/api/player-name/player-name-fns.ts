// Своё имя в профиле (lib/playerName, владелец 07.11.2026). Пустое — снять имя:
// снова виден @ник Telegram. Занято чужим именем, чужим ником или кошельком — отказ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireAccount } from "@/server/auth";
import { nameProblem, normalizeName } from "@/lib/playerName";

export const getMyName = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ name: string | null }> => {
    const acc = await requireAccount();
    const rows = (await mcpExec(
      `SELECT display_name AS name FROM yuplink.accounts WHERE id = ${sqlStr(acc)};`,
      { wrapJson: true },
    )) as Array<{ name: string | null }> | null;
    return { name: rows?.[0]?.name ?? null };
  },
);

export const setMyName = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ name: string | null }> => {
    const acc = await requireAccount();
    const name = normalizeName(data.name);
    const bad = nameProblem(name);
    if (bad) throw new Error(bad);
    const a = sqlStr(acc);
    if (name) {
      const v = sqlStr(name);
      // Имя аккаунта, ушедшего в архив (вход тем же Telegram), — свободно: его владелец
      // теперь на новом аккаунте и должен смочь взять своё имя снова.
      await mcpExec(
        `UPDATE yuplink.accounts SET display_name = NULL
          WHERE lower(display_name) = lower(${v}) AND archived_at IS NOT NULL;`,
      );
      const taken = (await mcpExec(
        `SELECT 1 AS x WHERE EXISTS (
           SELECT 1 FROM yuplink.accounts WHERE lower(display_name) = lower(${v}) AND id <> ${a})
         OR EXISTS (
           SELECT 1 FROM yuplink.users
            WHERE account_id IS DISTINCT FROM ${a}
              AND (lower(btrim(telegram_username)) = lower(${v}) OR lower(wallet) = lower(${v})));`,
        { wrapJson: true },
      )) as unknown[] | null;
      if (taken?.length) throw new Error("pname.taken");
    }
    try {
      await mcpExec(
        `UPDATE yuplink.accounts SET display_name = ${name ? sqlStr(name) : "NULL"} WHERE id = ${a};`,
      );
    } catch (e) {
      // Двое разом взяли одно имя — уникальный индекс отказал второму.
      if (/accounts_display_name_uq|duplicate key/i.test(String(e))) throw new Error("pname.taken");
      throw e;
    }
    return { name: name || null };
  });
