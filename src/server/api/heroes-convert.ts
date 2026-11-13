// Герои: превращение фишки в героя (фишка сгорает, ролл по настройке коллекции).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { accountOf } from "./user";
import { heroStatsAt } from "@/lib/heroStats";
import { secureRandom, secureRandomInt } from "@/lib/secureRandom";
import {
  convertRuleForChipLevel,
  nextLevelCost,
  MAX_LEVEL_BY_RARITY,
  type HeroRarity,
} from "@/lib/heroLevels";
import { requireHeroConvert, spendLikes, type HeroRow } from "./heroes-shared";
import { rarityOfTemplateLevel } from "./heroes-list-dormant";

/**
 * Превратить фишку в героя. Цена и ярус шаблона — от уровня фишки
 * (3/3.5★ → rare 50, 4/4.5★ → epic 1000, 5★ → legendary 5000); записанная
 * редкость — по ярусу выпавшего шаблона (rarityOfTemplateLevel).
 * Фишка сгорает, герой роллится из пула коллекции (chip_collection_hero).
 */
export const convertChipToHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ chipId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireHeroConvert();
    const account = await accountOf(wallet);

    const chip = await pg.userChipInventory.findOne({ id: data.chipId });
    if (!chip) throw new Error("Фишка не найдена");
    if (chip.account_id !== account) throw new Error("Это не твоя фишка");
    if (chip.status !== "owned")
      throw new Error("Фишка недоступна (в бою, на маркете или сожжена)");

    const rule = convertRuleForChipLevel(Number(chip.level));
    if (!rule) throw new Error("В героя превращаются только фишки от 3★");

    // Пул героев задаётся на коллекцию в админке (chip_collection_hero).
    const cfg = await pg.chipCollectionHero.findOne({ collection_id: chip.collection_id });
    if (!cfg || !cfg.active) throw new Error("Для этой коллекции превращение не настроено");
    const pool = (cfg.hero_template_ids as string[] | null) ?? [];

    // Явный пул приоритетнее; если он пуст — берём всех активных героев расы
    // коллекции (в админке чаще задают только расу, а пул оставляют пустым).
    const { data: poolRows } = pool.length
      ? await pg.mysticItemTemplates.raw().select("*").in("id", pool)
      : await pg.mysticItemTemplates
          .raw()
          .select("*")
          .eq("kind", "hero")
          .eq("active", true)
          .eq("race", cfg.race ?? "");
    // Обычных (ярус 1–2) из фишек не делают: это стартовые герои на выбор
    // расы, а раса коллекции подтягивает и их (владелец, 22.10.2026: «обычные
    // герои всегда обычные» — за фишку от 3★ обычного не выдаём).
    let candidates = (
      (poolRows ?? []) as Array<{
        id: string;
        specialization: string | null;
        level: number | null;
      }>
    ).filter((c) => rarityOfTemplateLevel(c.level) !== "common");
    if (candidates.length === 0) {
      throw new Error("Шаблоны героев не найдены — задай пул или расу в настройках коллекции");
    }

    // Пул целиком — он же самый широкий запасной вариант, если после отсева
    // уникальных в узком выборе никого не останется.
    const wholePool = candidates;

    // Шаблоны героев заведены под уровень фишки-исходника (3★/4★/5★ — свои
    // герои). Берём соответствующий ярус; если такого нет — оставляем всех.
    const tier = Math.floor(Number(chip.level));
    const byTier = candidates.filter((c) => Number(c.level) === tier);
    if (byTier.length > 0) candidates = byTier;
    const tierPool = candidates;

    // Ролл специализации по весам (если заданы) — иначе равномерно по пулу.
    const weights = (cfg.spec_weights as Array<{ spec: string; weight: number }> | null) ?? [];
    if (weights.length > 0) {
      const total = weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
      if (total > 0) {
        let roll = secureRandom() * total;
        let picked: string | null = null;
        for (const w of weights) {
          roll -= Math.max(0, w.weight);
          if (roll <= 0) {
            picked = w.spec;
            break;
          }
        }
        const bySpec = candidates.filter((c) => c.specialization === picked);
        if (bySpec.length > 0) candidates = bySpec;
      }
    }
    // Уникального героя убираем, как только он кому-то достался: признак живёт
    // в meta.unique шаблона (heroes-unique).
    //
    // Если после отсева в узком выборе не осталось никого — а так бывает, когда
    // веса увели ролл в специализацию, где уникальный один, — РАСШИРЯЕМ выбор:
    // сначала весь ярус, потом весь пул коллекции. Выдать уникального второй раз
    // значит обесценить саму пометку, а расширение стоит игроку разве что
    // другой специализации героя.
    const { takenUniqueIds } = await import("./heroes-unique");
    const busy = await takenUniqueIds(wholePool.map((c) => c.id));
    if (busy.size > 0) {
      const free = <T extends { id: string }>(list: T[]) => list.filter((c) => !busy.has(c.id));
      // Последняя строка — узкий выбор как есть: пул целиком состоит из
      // розданных уникальных. Оставить игрока без героя за сожжённую фишку
      // нельзя, это чинится в админке, а не отказом.
      candidates = [free(candidates), free(tierPool), free(wholePool), candidates].find(
        (list) => list.length > 0,
      )!;
    }

    const tpl = candidates[secureRandomInt(0, candidates.length)];
    // Редкость экземпляра — по ярусу шаблона, как у пробуждения и прокачки
    // (rarityOfTemplateLevel). Обычно это и есть ярус фишки (выбор идёт по
    // ярусу), а запасной выбор из соседнего яруса не даёт герою чужую редкость.
    const rarity = rarityOfTemplateLevel(tpl.level);

    // Фишка сгорает ПЕРВОЙ и условно: она же и есть замок операции. Раньше
    // сначала списывались лайки, и проигравший в гонке за одну фишку оставался
    // и без лайков, и без фишки, и без героя.
    const { mcpExec } = await import("../db/mcpClient");
    const { sqlStr } = await import("./chips-utils");
    const burned = (await mcpExec(
      `UPDATE yuplink.user_chip_inventory SET status = 'burned', updated_at = now()
        WHERE id = ${sqlStr(chip.id)} AND status = 'owned' RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    if (!burned?.length) throw new Error("Эта фишка уже использована");

    let likesLeft: number;
    try {
      likesLeft = await spendLikes(wallet, rule.likes, "hero_convert", chip.id);
    } catch (e) {
      // Не заплатил — фишку возвращаем, иначе она сгорела впустую.
      await pg.userChipInventory
        .update({ id: chip.id }, { status: "owned", updated_at: new Date().toISOString() })
        .catch(() => undefined);
      throw e;
    }

    const id = `hero_${nanoid(10)}`;
    const ugiId = `ugi_${nanoid(10)}`;
    // Видимый предмет-герой в инвентаре заводим ПЕРВЫМ, чтобы экземпляр сразу
    // сослался на него (item_id). Иначе предмет считается «спящим» (нет
    // привязанного экземпляра), герой двоится в списках, а пробуждение спящего
    // плодит ВТОРОЙ экземпляр того же героя из одной фишки.
    await pg.userGameItems.insert({
      id: ugiId,
      account_id: account,
      wallet,
      template_id: tpl.id,
      kind: "hero",
      source: "chip_convert",
      obtained_at: new Date().toISOString(),
    });
    // hero_instance хранит прокачку; item_id связывает его с предметом выше.
    await pg.heroInstances.insert({
      id,
      wallet,
      template_id: tpl.id,
      item_id: ugiId,
      rarity,
      level: 0,
      likes_spent: rule.likes,
      equipped: {},
      source: "chip_convert",
      source_chip_id: chip.id,
    });
    // Отдаём героя целиком: окно результата показывает его карточку со
    // статами и не закрывается, пока игрок сам не нажмёт кнопку.
    const tplFull = (await pg.mysticItemTemplates.findOne({ id: tpl.id })) as {
      name?: string;
      image_url?: string | null;
      race?: string | null;
      specialization?: string | null;
    } | null;
    return {
      ok: true,
      heroId: id,
      rarity,
      spentLikes: rule.likes,
      likesLeft,
      name: tplFull?.name ?? "Герой",
      imageUrl: tplFull?.image_url ?? null,
      race: tplFull?.race ?? null,
      specialization: tplFull?.specialization ?? null,
      level: 0,
      stats: heroStatsAt(tplFull?.race ?? null, tplFull?.specialization ?? null, 0),
    };
  });
