// Кто выходит в бой: переданный игроком отряд или авто-подбор по уровню.
//
// Здесь же отсеиваются фишки, которые сейчас не боеспособны: отдыхают после
// передачи (rest_until) или оглушены боссом (chip_effects).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { SimChip } from "./encounter-sim";
import { raidOwner } from "./owner";

/**
 * Сколько фишек берёт авто-отряд: поле (FIELD_SLOTS) и запас, который выходит на место
 * павших (encounter-sim) — столько же, сколько игрок может собрать сам.
 */
export const AUTO_LINEUP = 10;

/** Отряд и признак «собран сервером» — окно боя запомнит такой состав у игрока. */
export type LineupInfo = { lineup: SimChip[]; auto: boolean };

/** Отряд игрока (без признака авто) — для вызывающих, которым он не нужен. */
export async function resolveLineup(wallet: string, passed: SimChip[]): Promise<SimChip[]> {
  return (await resolveLineupInfo(wallet, passed)).lineup;
}

/**
 * Отряд игрока: переданный — с проверкой владения, иначе авто-топ по уровню.
 *
 * Фишки не выбраны — либо ни одной из выбранных нет в строю (сгорели, оглушены, в
 * браузере чужой состав) — в бой идут самые сильные: AUTO_LINEUP старших по уровню
 * (сила фишки в бою — от уровня, lib/chipStats). Владелец, 24.10.2026: «если фишки не
 * выбраны — выбирать автоматически самые сильные» (жалоба: удар по нажатию шёл
 * пустым/одной фишкой, бой проигран, энергия потрачена).
 *
 * Когда включат `hero_squad_battles`, вместо авто-подбора будет браться отряд,
 * закреплённый за основным героем (heroes-squad.ts), и окно выбора фишек в бою
 * станет не нужно. Пока переключатель выключен — поведение прежнее.
 */
export async function resolveLineupInfo(wallet: string, passed: SimChip[]): Promise<LineupInfo> {
  const account = await raidOwner(wallet);
  // Оглушённые боссом фишки отсеиваем прямо здесь: иначе авто-отряд собирался
  // бы из них и выходил в бой неполным.
  const rows = (await mcpExec(
    `SELECT c.id, c.template_id, c.level, t.name FROM yuplink.user_chip_inventory c
      LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
      WHERE c.account_id = ${sqlStr(account)} AND c.status = 'owned'
        AND (c.rest_until IS NULL OR c.rest_until <= now())
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.chip_effects e
           WHERE e.chip_id = c.id AND e.kind = 'stun' AND e.expires_at > now()
        )
      ORDER BY c.level DESC;`,
    { wrapJson: true },
  )) as Array<{ id: string; template_id: string; level: number; name: string | null }>;
  const owned = rows ?? [];

  if (passed.length > 0) {
    // Клиент присылает отряд стаками (шаблон + уровень), без конкретных
    // экземпляров. Подбираем их здесь: без chipId яд и оглушение не на что
    // вешать, а игрок ещё и мог прислать фишки, которых у него нет.
    const pool = new Map<string, Array<{ id: string; name: string | null }>>();
    for (const r of owned) {
      const k = `${r.template_id}|${Number(r.level)}`;
      const list = pool.get(k);
      if (list) list.push(r);
      else pool.set(k, [r]);
    }
    // Триал-фишки прихожи — отдельная коллекция, в инвентаре их нет. Раньше
    // флаг training верили на слово: десять «пятизвёзд» выходили в бой у
    // кошелька с пустым инвентарём. Теперь каждая проверяется по своей
    // таблице, звезду берём из базы, а не с клиента, и каждую засчитываем
    // ровно один раз. Как это давно сделано в бою с боссом (boss.ts).
    const trialIds = passed
      .filter((c) => c.training && c.trainingId)
      .map((c) => c.trainingId as string);
    const trialStar = new Map<string, number>();
    if (trialIds.length > 0) {
      const tRows = (await mcpExec(
        `SELECT id, star FROM yuplink.hallway_training_chips
          WHERE account_id = ${sqlStr(account)} AND consumed_at IS NULL
            AND id IN (${trialIds.map(sqlStr).join(",")});`,
        { wrapJson: true },
      )) as Array<{ id: string; star: number }>;
      for (const r of tRows ?? []) trialStar.set(r.id, Number(r.star));
    }
    const usedTrial = new Set<string>();

    const out: SimChip[] = [];
    let skipped = 0;
    for (const c of passed.slice(0, 10)) {
      if (c.training) {
        const star = c.trainingId ? trialStar.get(c.trainingId) : undefined;
        if (star === undefined || usedTrial.has(c.trainingId as string)) {
          skipped++;
          continue;
        }
        usedTrial.add(c.trainingId as string);
        // Экземпляр инвентаря сюда не даём: эффект уехал бы на чужую фишку.
        // Имя ставим своё: у триала нет шаблона в инвентаре, и в логе боя
        // строка про её крит оставалась бы без подписи.
        out.push({ templateId: c.templateId, level: star, training: true, name: "Тренировочная" });
        continue;
      }
      const k = `${c.templateId}|${Number(c.level)}`;
      const inst = pool.get(k)?.shift();
      if (!inst) {
        // Фишки может не быть по двум причинам: её у игрока правда нет либо
        // она сейчас оглушена/отдыхает (в пул такие не попадают). Отряд
        // хранится у игрока в localStorage, поэтому молча пропускаем
        // недоступную позицию — иначе бой намертво упирался бы в ошибку.
        skipped++;
        continue;
      }
      out.push({ templateId: c.templateId, level: c.level, chipId: inst.id, name: inst.name });
    }
    // Чего не хватило — добираем лучшими из оставшихся. Отряд игрок хранит у
    // себя в браузере, и часть состава легко устаревает: фишку скрафтили,
    // продали, она оглушена или отдыхает. Раньше это упиралось в ошибку и
    // игрок вообще не мог атаковать, хотя фишек у него полный инвентарь.
    // Не нашлось НИ ОДНОЙ из выбранных — это «не выбраны»: полный авто-отряд ниже.
    if (skipped > 0 && out.length > 0) {
      const want = Math.min(10, passed.length);
      for (const list of pool.values()) {
        while (out.length < want && list.length > 0) {
          const inst = list.shift()!;
          const src = owned.find((r) => r.id === inst.id);
          if (!src) continue;
          out.push({
            templateId: src.template_id,
            level: Number(src.level),
            chipId: src.id,
            name: inst.name,
          });
        }
        if (out.length >= want) break;
      }
    }
    if (out.length > 0) return { lineup: out, auto: false };
  }

  // ⚠️ Отряд героя приходит без chipId и без проверки оглушения: пока
  // переключатель hero_squad_battles выключен, это не работает, но перед его
  // включением сюда надо добавить подбор экземпляров — иначе яд и оглушение
  // перестанут и накладываться, и читаться.
  const { heroSquadBattlesEnabled, selectedHeroSquad } = await import("../heroes-squad");
  if (await heroSquadBattlesEnabled()) {
    const squad = await selectedHeroSquad(wallet);
    if (squad.length > 0) {
      return { lineup: squad.map((c) => ({ templateId: c.templateId, level: c.level })), auto: false };
    }
  }

  if (owned.length === 0) {
    throw new Error("Нет фишек для боя — открой пак или дождись отдыха фишек");
  }
  return {
    lineup: owned.slice(0, AUTO_LINEUP).map((r) => ({
      templateId: r.template_id,
      level: Number(r.level),
      chipId: r.id,
      name: r.name,
    })),
    auto: true,
  };
}
