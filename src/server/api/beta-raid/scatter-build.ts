// Что именно поставим на карту: раздача фондов по заготовкам. Ни клеток, ни
// записи в базу — только арифметика поверх справочников (scatter-tpl).
//
// ГЛАВНОЕ ПРАВИЛО ФАЙЛА: у КАЖДОЙ заготовки боссов и кучек своя награда в
// object_config. Оставить объект без неё нельзя даже с нулевым фондом: тогда в
// игру пойдёт награда шаблона, и сотня «пустых» сундуков молча утянет из пула
// карты по своему номиналу каждый.
//
// Кучки (сундуки и монетки) считает scatter-piles: у них своя арифметика с
// потолками шаблонов и «средним значением», и вместе файл не влезал в 250 строк.
import { type RewardConfig } from "../raid-shared";
import { splitFundByLevels, raffleItems } from "@/lib/raid/scatterMath";
import { landTotal, spreadLands } from "@/lib/raid/scatterLands";
import { loadArtTpl, loadBossTpl, loadLootTpl, loadPileTpl, type Tpl } from "./scatter-tpl";
import { buildPiles } from "./scatter-piles";
import { buildLoot } from "./scatter-loot";
import { draft, filler, fundNotes, pick, scatterRnd, type GroupBuild } from "./scatter-parts";
import type { Rnd } from "@/lib/raid/scatterMath";
import {
  GROUP_LABEL,
  type ScatterPlan,
  type BossPlan,
  type ArtifactPlan,
} from "@/lib/raid/scatterPlan";

// Заготовка и её конфиг живут в scatter-parts, но зовут их отсюда: отчёт,
// обеспечение и сама ручка знают раздачу этим именем ещё с первой версии.
export type { ScatterDraft, DraftConfig, GroupBuild } from "./scatter-parts";

/**
 * Местность объекта: отмеченная админом перебивает шаблонную.
 *
 * Владелец просил «выбрал три местности и раскидал по ним» и «пятьдесят в
 * аду» — значит выбор в панели главнее поля `land` в карточке шаблона. Ничего
 * не отмечено — `spread` пустой, и каждый встаёт на свою, как было.
 */
const landOf = (
  picked: boolean,
  spread: Array<string | null>,
  i: number,
  tplLand: string | null,
): string | null => (picked ? (spread[i] ?? null) : tplLand);

/**
 * Боссы с уровнем местности: только на местностях этого уровня. Отмеченные в
 * панели местности вне уровня отбрасываются (и это пишется в отчёт), а добор
 * недостачи идёт тоже только по ним (GroupBuild.terrains → pickCells).
 */
async function bossBuild(plan: BossPlan, tpls: Tpl[], arts: Tpl[][], rnd: Rnd): Promise<GroupBuild> {
  const range = plan.terrainLevel ?? null;
  if (!range) return buildBoss(plan, tpls, arts, rnd);
  const { terrainsAtLevel, levelLabel } = await import("./scatter-terrain-level");
  const terrains = await terrainsAtLevel(range);
  const lands = plan.lands.filter((l) => terrains.includes(l.terrainId));
  const build = buildBoss({ ...plan, lands }, tpls, arts, rnd);
  const label = levelLabel(range);
  if (terrains.length === 0) {
    build.notes.push(`Боссы: нет местностей ${label} уровня — не встанет ни один`);
  }
  if (lands.length < plan.lands.length) {
    build.notes.push(
      `Боссы: ${plan.lands.length - lands.length} отмеченных местностей не ${label} уровня — пропущены`,
    );
  }
  return { ...build, terrains };
}

/** Боссы: фонд по уровням, штучное — жребием. */
function buildBoss(plan: BossPlan, tpls: Tpl[], arts: Tpl[][], rnd: Rnd): GroupBuild {
  if (tpls.length === 0) {
    return { group: "boss", drafts: [], notes: ["Боссы: шаблонов такого уровня нет"] };
  }
  // Отмечены местности — счёт объектов задают ОНИ («50 в аду и 30 в раю» это
  // восемьдесят боссов, даже если общее поле пустое), иначе поле «Сколько».
  const picked = plan.lands ?? [];
  const total = landTotal(picked, plan.count);
  const spread = spreadLands(total, picked, plan.count);
  const chosen = Array.from({ length: total }, () => pick(tpls, rnd));
  const levels = chosen.map((t) => t.level);
  const money = plan.funds.map((f) => splitFundByLevels(levels, f.amount, { rnd }));
  // Свой кубик на каждый вид пака и каждую позицию артефакта — так просил
  // владелец: иначе один счастливчик собирал бы всё сразу.
  const packs = plan.packs.map((p) => raffleItems(chosen.length, p.count, rnd));
  const won = plan.arts.map((a) => raffleItems(chosen.length, a.count, rnd));

  const drafts = chosen.map((tpl, i) => {
    const cfg: RewardConfig = { fillers: [], split: tpl.split, packs: [], items: [] };
    plan.funds.forEach((f, k) => {
      if ((money[k][i] ?? 0) > 0) cfg.fillers.push(filler(f, money[k][i]));
    });
    plan.packs.forEach((p, k) => {
      // toPlace: N — «первым N местам по паку», ровно N штук на объект.
      const n = packs[k][i] ?? 0;
      if (n > 0 && p.packId) cfg.packs.push({ packId: p.packId, toPlace: n });
    });
    plan.arts.forEach((_, k) => {
      const n = won[k][i] ?? 0;
      const pool = arts[k] ?? [];
      // Один шаблон на всю стопку: двумя строками по toPlace:1 оба артефакта
      // достались бы ПЕРВОМУ месту — N предметов одному вместо N мест.
      if (n > 0 && pool.length > 0)
        cfg.items.push({ itemTemplateId: pick(pool, rnd).id, toPlace: n });
    });
    return draft("boss", `boss:${tpl.id}`, landOf(picked.length > 0, spread, i, tpl.land), cfg);
  });
  const why = "жребий по уровням раздал меньше; прогони ещё раз или подними фонд";
  return { group: "boss", drafts, notes: fundNotes(GROUP_LABEL.boss, plan.funds, money, why) };
}

/** Артефакты-объекты: своей награды не нужно — артефакт отдаёт сам себя. */
function buildArtifacts(plan: ArtifactPlan, tpls: Tpl[], rnd: Rnd): GroupBuild {
  const notes =
    tpls.length === 0 ? [`${GROUP_LABEL.artifact}: подходящих шаблонов не нашлось`] : [];
  const picked = plan.lands ?? [];
  const total = landTotal(picked, plan.count);
  const spread = spreadLands(total, picked, plan.count);
  const drafts = Array.from({ length: tpls.length === 0 ? 0 : total }, (_, i) => {
    const tpl = pick(tpls, rnd);
    return draft(
      "artifact",
      `artifact:${tpl.id}`,
      landOf(picked.length > 0, spread, i, tpl.land),
      null,
    );
  });
  return { group: "artifact", drafts, notes };
}

/**
 * Весь план разом: справочники читаем параллельно, считаем по группам.
 *
 * Кубик один на весь план и создаётся ЗДЕСЬ: с сидом в плане та же кнопка даёт
 * те же шаблоны и те же номиналы, без сида — прежний Math.random. Группы берут
 * из него по очереди, поэтому повтор обязан идти тем же порядком — трогать
 * порядок вызовов ниже значит сломать воспроизводимость.
 */
export async function buildScatter(plan: ScatterPlan): Promise<GroupBuild[]> {
  const rnd = scatterRnd(plan.seed);
  // Единый раздел добычи главнее пары «сундуки + монетки»: панель шлёт его,
  // старые планы (и тесты) продолжают ходить прежним путём.
  const loot = plan.loot?.enabled ? plan.loot : null;
  const [bossTpl, lootTpl, chestTpl, coinTpl, artTpl, bossArts] = await Promise.all([
    plan.boss.enabled ? loadBossTpl(plan.boss.levelMin, plan.boss.levelMax) : [],
    loot ? loadLootTpl(loot.templateIds) : [],
    !loot && plan.chests.enabled ? loadPileTpl("chest", plan.chests.templateIds) : [],
    !loot && plan.coins.enabled ? loadPileTpl("coin", plan.coins.templateIds) : [],
    plan.artifacts.enabled ? loadArtTpl(plan.artifacts.rarities, plan.artifacts.templateIds) : [],
    Promise.all(
      (plan.boss.enabled ? plan.boss.arts : []).map((a) =>
        loadArtTpl(a.rarity ? [a.rarity] : [], a.templateIds),
      ),
    ),
  ]);

  const out: GroupBuild[] = [];
  if (plan.boss.enabled) out.push(await bossBuild(plan.boss, bossTpl, bossArts, rnd));
  if (loot) out.push(...buildLoot(loot, lootTpl, rnd));
  if (!loot && plan.chests.enabled) out.push(buildPiles(plan.chests, "chest", chestTpl, rnd));
  if (!loot && plan.coins.enabled) out.push(buildPiles(plan.coins, "coin", coinTpl, rnd));
  if (plan.artifacts.enabled) out.push(buildArtifacts(plan.artifacts, artTpl, rnd));
  return out;
}
