// Финал короткой истории: реальные игровые факты, книга выбранного героя.
// Новых таблиц, ролей и прямых административных операций с БД не требуется.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireBetaRaid } from "../gate";
import { raidOwner } from "../owner";
import { currentStep, islandTutorialOrder } from "@/lib/raid/island/steps";
import { hexDist } from "@/lib/raid/zonegen/town/hex";
import { spellHero, learnedSpellIds } from "../spell-book";
import { loadSpellTemplates } from "../spell-tpl";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";
import { loadIsland, markDone } from "./island-row";
import { islandFacts } from "./island-facts";
import { ISLAND_OBJECTS } from "@/lib/raid/island/catalog";
import { liveRewardSql } from "@/server/api/raid-reward-live";

async function context() {
  const wallet = await requireBetaRaid();
  const account = await raidOwner(wallet);
  const row = await loadIsland(account);
  if (!row?.mapId || !row.places.lesson) throw new Error("Начни короткое обучение на своём острове.");
  if (row.skippedAt) throw new Error("Вернись к обучению, чтобы продолжить этот шаг.");
  const done = new Set(row.done);
  const facts = await islandFacts(account, row.mapId, row.places, done, !!row.resetAt);
  const fresh = facts.done.filter((id) => !done.has(id));
  if (fresh.length) { await markDone(account, fresh, row.mapId); for (const id of fresh) done.add(id); }
  return { wallet, account, row, done, facts, current: currentStep(done, row.places, islandTutorialOrder(true, row.places)) };
}

/** Пропуск меняет только проводку: не подделывает победу, продажу и выдачу. */
export async function skipShortTutorialStep() {
  const c = await context();
  if (c.current && c.current !== "hello" && c.current !== "hero_pick")
    await markDone(c.account, [`skip:${c.current}`]);
  return { ok: true as const };
}

async function rewardView(c: Awaited<ReturnType<typeof context>>) {
  if (c.row.places.lesson!.pillar) throw new Error("Изучи заклинание у отмеченного столба на островке.");
  const at = c.facts.at;
  const reachable = !!at && !c.row.places.lesson!.water.some((w) => w.q === at.q && w.r === at.r) && hexDist(at, c.row.places.lesson!.shore) <= 1 && c.done.has("sail");
  const hero = await spellHero(c.wallet);
  if (!hero) throw new Error("Выбери героя, чтобы получить заклинание.");
  const [templates, known] = await Promise.all([loadSpellTemplates(), learnedSpellIds(hero.heroId, true)]);
  const savedId = [...c.done].find((id) => id.startsWith("spell-choice:"))?.slice("spell-choice:".length);
  const eligible = templates.filter((t) => t.minInt <= hero.intellect)
    .sort((a, b) => a.minInt - b.minInt || a.id.localeCompare(b.id));
  const total = spellbookSlots({ spec: hero.spec, rarity: hero.rarity });
  const tpl = savedId ? eligible.find((t) => t.id === savedId)
    // При повторной проходке показываем уже знакомое, не раздаём каталог по кругу.
    : eligible.find((t) => known.includes(t.id))
      ?? (known.length < total ? eligible.find((t) => !known.includes(t.id)) : null);
  if (!tpl) throw new Error("Сейчас нет доступного заклинания для этого героя. Попробуй позже.");
  return { reachable, hero, total, known, tpl };
}

export async function getShortTutorialReward() {
  const c = await context();
  const v = await rewardView(c);
  return { reachable: v.reachable, name: v.tpl.name, image: v.tpl.image,
    description: v.tpl.description, alreadyKnown: v.known.includes(v.tpl.id) };
}

/** Выбор награды делает сервер. Повтор/перезагрузка не выдаёт другую. */
export async function claimShortTutorialSpell() {
  const c = await context();
  if (c.current !== "spell" && !c.done.has("spell")) throw new Error("Сначала заверши предыдущий шаг обучения.");
  const v = await rewardView(c);
  if (!v.reachable) throw new Error("Переплыви озеро на лодке и подойди к отмеченному берегу.");
  await markDone(c.account, [`spell-choice:${v.tpl.id}`]);
  const known = v.known.includes(v.tpl.id);
  if (!known) {
    const rows = await mcpExec(`INSERT INTO yuplink.hero_spellbook (hero_id, spell_id, learned_at)
      SELECT ${sqlStr(v.hero.heroId)}, ${sqlStr(v.tpl.id)}, now()
       WHERE (SELECT count(*) FROM yuplink.hero_spellbook WHERE hero_id = ${sqlStr(v.hero.heroId)}) < ${Math.max(0, Math.floor(v.total))}
      ON CONFLICT ON CONSTRAINT hero_spellbook_pk DO NOTHING RETURNING spell_id;`, { wrapJsonCte: true }) as unknown[];
    if (!rows?.length && !(await learnedSpellIds(v.hero.heroId, true)).includes(v.tpl.id))
      throw new Error("В книге нет свободного места. Освободи место и забери заклинание.");
  }
  await markDone(c.account, ["spell"]);
  return { ok: true as const, spellId: v.tpl.id, name: v.tpl.name, alreadyKnown: known };
}

/** Вызывается только ПОСЛЕ успешной выплаты магазина; не меняет сам обмен. */
export async function noteShortTutorialSale(account: string, mapId: string, itemId: string) {
  if (!mapId.startsWith("isle_") || itemId !== `${mapId}_sell_goldIngot`) return;
  const row = await loadIsland(account);
  if (row?.mapId === mapId && row.places.lesson) await markDone(account, ["sell", "chest_backpack"]);
}

/** Сначала реальные награды сундука в «Добыче», потом показ вещей в рюкзаке. */
export async function shortChestPending(account: string, mapId: string): Promise<boolean> {
  const rows = await mcpExec(`SELECT EXISTS (SELECT 1 FROM yuplink.raid_reward
    WHERE account_id = ${sqlStr(account)} AND location_id = ${sqlStr(mapId)}
      AND boss_id = ${sqlStr(ISLAND_OBJECTS.chest.replace(/^chest:/, ""))}
      AND claimed_at IS NULL AND ${liveRewardSql()}) AS pending;`, { wrapJson: true }) as Array<{pending: boolean}>;
  return rows?.[0]?.pending === true;
}
