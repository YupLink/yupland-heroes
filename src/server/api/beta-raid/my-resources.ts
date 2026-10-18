// Ресурсы игрока с шахт: gold/stone/diamonds/wood. Живут на account_id
// (yuplink.account_resources), общие для всех sister-кошельков аккаунта.
// Лайки/билеты/энергия сюда НЕ входят — у них свои таблицы и свой показ в шапке.
import { createServerFn } from "@tanstack/react-start";
import { getCurrentWallet } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { accAccountId } from "../currency/move";

export type MineResources = {
  gold: number;
  stone: number;
  diamonds: number;
  wood: number;
};

const EMPTY: MineResources = { gold: 0, stone: 0, diamonds: 0, wood: 0 };

export const getMyResources = createServerFn({ method: "GET" }).handler(
  async (): Promise<MineResources> => {
    const wallet = getCurrentWallet();
    if (!wallet) return { ...EMPTY };
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return { ...EMPTY };
    const rows = (await mcpExec(
      `SELECT resource, amount FROM yuplink.account_resources
         WHERE account_id=${sqlStr(account)}
           AND resource IN ('gold','stone','diamonds','wood');`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ resource: string; amount: number }>;
    const out: MineResources = { ...EMPTY };
    for (const row of rows ?? []) {
      if (row.resource in out) out[row.resource as keyof MineResources] = Number(row.amount) || 0;
    }
    return out;
  },
);
