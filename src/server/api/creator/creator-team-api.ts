// Ручки команды креаторов (creator-team.ts): каталог «креатор → его миры» и
// «добавить креатора» по нику Telegram — только админам игры (владелец и Ярослав).
//
// Серверные модули грузятся внутри ручек: этот файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "../beta-raid/gate";

async function requireAdminCreator(): Promise<{ account: string }> {
  const wallet = await requireBetaRaid();
  const { isAdminWallet } = await import("@/server/auth");
  if (!isAdminWallet(wallet)) throw new Error("Доступ запрещён");
  const { raidOwner } = await import("../beta-raid/owner");
  return { account: await raidOwner(wallet) };
}

/** Все креаторы и их миры (портфолио), и все миры по авторам. */
export const listCreatorTeam = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireAdminCreator();
  const { creatorTeam } = await import("./creator-team");
  return creatorTeam(me.account);
});

/** Добавить креатора по нику Telegram («@nick» или «nick»). */
export const addCreator = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ nick: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdminCreator();
    const { addCreatorByTg } = await import("./creator-team");
    return addCreatorByTg(data.nick);
  });
