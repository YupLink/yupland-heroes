// Полки «Газетного киоска» (§8.96, Кай 31.10.2026): «Отложенные» и
// «Прочитанные», обе по неделям. Прочитанное сохраняется, если киоск был в
// момент прочтения; перечитывать — сколько угодно (картинка — здесь же).
// Отложенный выпуск читают отсюда и отмечают тем же markNewspaperRead.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { groupByWeek, type KioskNewspapers, type NewspaperView } from "@/lib/newspaper";
import { kioskSql } from "@/server/api/newspaper/paper-sql";
import { kioskAccount, requireNewspaperKiosk } from "./kiosk-own";

type Row = {
  issueId: string;
  date: string;
  title: string | null;
  imageUrl: string;
  editions?: import("@/lib/newspaper").NewspaperEditions | null;
  read: boolean;
  deferred: boolean;
};

/** Разложить строки по вкладкам: прочитанное — в «Прочитанные», остальное — в «Отложенные». */
export function kioskShelves(rows: readonly Row[]): KioskNewspapers {
  const view = (r: Row): NewspaperView => ({
    issueId: r.issueId,
    date: r.date,
    title: r.title ?? null,
    imageUrl: r.imageUrl,
    editions: r.editions ?? null,
    deferred: r.deferred === true,
    read: r.read === true,
    kiosk: true,
    canDefer: r.read !== true,
  });
  const all = rows.map(view);
  return {
    deferred: groupByWeek(all.filter((v) => !v.read)),
    read: groupByWeek(all.filter((v) => v.read)),
  };
}

/** Полки киоска игрока; киоска нет — kiosk.not_built. */
export const getKioskNewspapers = createServerFn({ method: "GET" }).handler(
  async (): Promise<KioskNewspapers> => {
    const account = await kioskAccount();
    await requireNewspaperKiosk(account);
    const rows = (await mcpExec(kioskSql(account), { wrapJson: true })) as Row[];
    return kioskShelves(rows ?? []);
  },
);
