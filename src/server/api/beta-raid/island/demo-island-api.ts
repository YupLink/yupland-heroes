// Ручки демо-острова (demo-island.ts) для строки профиля. Войти — только с
// правом admin_rights «demo_island»; выйти — всегда, если стоит на своём
// демо-острове (право сняли, пока она там, — не застрянет).
//
// Серверные модули грузятся внутри ручек: этот файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "../gate";

async function who(): Promise<{ wallet: string; account: string }> {
  const wallet = await requireBetaRaid();
  const { raidOwner } = await import("../owner");
  return { wallet, account: await raidOwner(wallet) };
}

async function hasRight(account: string): Promise<boolean> {
  const { accountHasRight } = await import("@/server/admin-rights");
  return accountHasRight(account, "demo_island");
}

/** Есть ли строка в профиле и на демо-острове ли она сейчас. Без права — «нет». */
export const getDemoIslandAccess = createServerFn({ method: "GET" }).handler(async () => {
  const me = await who().catch(() => null);
  if (!me) return { allowed: false, onDemo: false };
  const { onDemoIsland } = await import("./demo-island");
  const onDemo = await onDemoIsland(me.account).catch(() => false);
  return { allowed: onDemo || (await hasRight(me.account)), onDemo };
});

export const demoIslandEnter = createServerFn({ method: "POST" }).handler(async () => {
  const { wallet, account } = await who();
  if (!(await hasRight(account))) throw new Error("Доступ запрещён");
  const { enterDemoIsland } = await import("./demo-island");
  return enterDemoIsland(wallet, account);
});

export const demoIslandLeave = createServerFn({ method: "POST" }).handler(async () => {
  const { wallet, account } = await who();
  const { leaveDemoIsland } = await import("./demo-island");
  return { moved: await leaveDemoIsland(wallet, account) };
});
