// Меню входа (Архан через владельца, 22.10.2026, задача #497194): новичку —
// «Начать игру» и выбор расы одного из шести героев, тому, кто уже играет, —
// «Продолжить». Здесь — кто новичок и выдача выбранного героя.
//
// Новичок — аккаунт без отметки «игру начал» (yuplink.game_start) и без единого
// героя. Отметку ставит выдача героя (starter-kit), всем, у кого герой уже был,
// её поставила миграция start-01: продал или сдал всех героев — второго
// бесплатного выбора нет.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { IslandHeroOption } from "@/server/api/beta-raid/island/island-gift";
import type { InviteWho } from "@/lib/referralShare";

export type GameStartOption = IslandHeroOption;
export type GameStartStatus = {
  /** true — игру ещё не начинал: «Начать игру» и выбор расы. */
  fresh: boolean;
  /** Обычные герои на выбор, по одному на расу; пусто у того, кто уже играет. */
  options: GameStartOption[];
  /** Новичка позвал друг — подпись «Подарок от…» в выборе расы (lib/referralShare). */
  invite?: InviteWho | null;
};

/** Начинал ли аккаунт игру: отметка или любой герой (предметом или экземпляром). */
export async function gameStartFresh(accountId: string): Promise<boolean> {
  const acc = sqlStr(accountId);
  const rows = (await mcpExec(
    `SELECT NOT EXISTS (SELECT 1 FROM yuplink.game_start s WHERE s.account_id = ${acc})
        AND NOT EXISTS (SELECT 1 FROM yuplink.user_game_item g
                         WHERE g.account_id = ${acc} AND g.kind = 'hero')
        AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.account_id = ${acc})
        AS fresh;`,
    { wrapJson: true },
  )) as Array<{ fresh: boolean }>;
  return rows?.[0]?.fresh === true;
}

/** Состояние меню: новичку — герои на выбор (тот же список, что на острове). */
export async function gameStartStatus(accountId: string): Promise<GameStartStatus> {
  if (!(await gameStartFresh(accountId))) return { fresh: false, options: [] };
  const { islandHeroOptions } = await import("@/server/api/beta-raid/island/island-gift");
  const { inviteOfAccount } = await import("@/server/referralInviter");
  const [options, invite] = await Promise.all([
    islandHeroOptions(),
    inviteOfAccount(accountId).catch(() => null),
  ]);
  return { fresh: true, options, invite };
}

/**
 * «Начать игру» с выбранным героем. Герой — только из списка на выбор. Повтор
 * не задваивает: героя кладёт одна вставка вместе с отметкой; уже начинал —
 * granted false, и это не ошибка (игрок просто входит).
 *
 * Новичка с героем встречает свой остров (island-newbie, 06.11.2026): island
 * true — герой уже стоит на старте острова, карту клиент перечитывает. Остров
 * не создался — 10 стартовых фишек, которые при включённом острове не выдавались
 * при регистрации (hallway-skip): новичок не остаётся ни с чем.
 */
export async function startGameWithHero(
  accountId: string,
  wallet: string,
  templateId: string,
  tgId: number | null = null,
): Promise<{ granted: boolean; island: boolean }> {
  const { islandHeroOptions } = await import("@/server/api/beta-raid/island/island-gift");
  const hero = (await islandHeroOptions()).find((o) => o.id === templateId);
  if (!hero) throw new Error("island.hero_unknown");
  const { grantStarterHero } = await import("@/server/api/starter-kit");
  const granted = await grantStarterHero(accountId, wallet, hero.id);
  if (!granted) return { granted, island: false };
  const { greetNewbie, islandNewbiesOn } =
    await import("@/server/api/beta-raid/island/island-newbie");
  const island = await greetNewbie(accountId, wallet);
  if (!island && (await islandNewbiesOn())) {
    const { grantSkipChips } = await import("@/server/api/hallway-skip");
    await grantSkipChips(wallet, tgId, accountId).catch((e) =>
      console.warn("[game-start] стартовые фишки без острова:", accountId, e),
    );
  }
  return { granted, island };
}
