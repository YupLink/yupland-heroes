// Что игрок видит (профиль, владелец 14.10.2026): чужие лагеря и их точки на
// карте мира, юпики, гуляющие по замку. Только отображение — игроки и их
// предметы на месте, одиночкой в мире никто не становится.
//
// Хранится на аккаунте (yuplink.account_view, migrations/view-01-account-view.sql),
// чтобы выключенное на телефоне было выключено и на ПК. Нет строки — всё видно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { currentAccount, requireAccount } from "../auth";

export type AccountView = { hidePlayers: boolean; hideResidents: boolean };

export const DEFAULT_VIEW: AccountView = { hidePlayers: false, hideResidents: false };

type Row = { hide_players: boolean; hide_residents: boolean };

const toView = (row: Row | undefined): AccountView =>
  row ? { hidePlayers: row.hide_players === true, hideResidents: row.hide_residents === true } : DEFAULT_VIEW;

export const getAccountView = createServerFn({ method: "GET" }).handler(async (): Promise<AccountView> => {
  const acc = await currentAccount();
  if (!acc) return DEFAULT_VIEW;
  const rows = (await mcpExec(
    `SELECT hide_players, hide_residents FROM yuplink.account_view WHERE account_id=${sqlStr(acc)} LIMIT 1;`,
    { wrapJson: true },
  )) as Row[];
  return toView(rows?.[0]);
});

export const setAccountView = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ hidePlayers: z.boolean().optional(), hideResidents: z.boolean().optional() }).strict().parse(d),
  )
  .handler(async ({ data }): Promise<AccountView> => {
    const acc = await requireAccount();
    const players = data.hidePlayers === undefined ? null : data.hidePlayers;
    const residents = data.hideResidents === undefined ? null : data.hideResidents;
    // Меняем только присланное: два переключателя не затирают друг друга.
    const rows = (await mcpExec(
      `INSERT INTO yuplink.account_view (account_id, hide_players, hide_residents)
       VALUES (${sqlStr(acc)}, coalesce(${players}::boolean, false), coalesce(${residents}::boolean, false))
       ON CONFLICT (account_id) DO UPDATE SET
         hide_players = coalesce(${players}::boolean, yuplink.account_view.hide_players),
         hide_residents = coalesce(${residents}::boolean, yuplink.account_view.hide_residents),
         updated_at = now()
       RETURNING hide_players, hide_residents;`,
      { wrapJsonCte: true },
    )) as Row[];
    return toView(rows?.[0]);
  });
