// Отряд героя записан «адресами» фишек (шаблон + уровень + серийник), а бою
// нужны КОНКРЕТНЫЕ экземпляры: без chip_id яду и оглушению не на что сесть,
// и босс молча теряет половину своих способностей.
//
// Зовут: encounter-lineup-squad.ts (сбор отряда перед боем) и heroes-squad.ts
// (проверка владения при закреплении). Чистая функция — списки приходят
// снаружи, БД здесь нет.
//
// Заодно это единственное место, где проверяется, что фишка вообще твоя:
// сейчас в отряд героя можно записать что угодно, включая чужие пятизвёздные.

/** Запись отряда так, как она лежит в hero_instance.squad. */
export type SquadEntry = {
  templateId: string;
  level: number;
  serialNo?: number | null;
};

/** Экземпляр из инвентаря игрока. */
export type MatchChip = {
  id: string;
  templateId: string;
  level: number;
  serialNo?: number | null;
  name?: string | null;
};

export type MatchedChip = {
  templateId: string;
  level: number;
  chipId: string;
  serialNo: number | null;
  name: string | null;
};

export type MatchResult = {
  /** Кого выводим в бой — по порядку отряда. */
  picked: MatchedChip[];
  /** Записи, которым экземпляр не нашёлся: отдыхает, оглушена или её нет. */
  missing: SquadEntry[];
};

const key = (templateId: string, level: number): string => `${templateId}|${Number(level)}`;

/**
 * Подобрать экземпляры под отряд. Сначала точное совпадение серийника (игрок
 * ставил именно эту фишку), потом любая свободная того же шаблона и уровня —
 * фишка могла уехать в NFT и вернуться с другим серийником, и вылетать из
 * отряда за это она не должна. Каждый экземпляр уходит в строй не больше раза.
 */
export function matchSquadToChips(squad: SquadEntry[], chips: MatchChip[]): MatchResult {
  const bySerial = new Map<string, MatchChip>();
  const pool = new Map<string, MatchChip[]>();
  for (const c of chips) {
    if (c.serialNo != null) bySerial.set(`${c.templateId}#${c.serialNo}`, c);
    const k = key(c.templateId, c.level);
    const list = pool.get(k);
    if (list) list.push(c);
    else pool.set(k, [c]);
  }

  const used = new Set<string>();
  const picked: MatchedChip[] = [];
  const missing: SquadEntry[] = [];

  const take = (c: MatchChip): MatchedChip => {
    used.add(c.id);
    return {
      templateId: c.templateId,
      level: c.level,
      chipId: c.id,
      serialNo: c.serialNo ?? null,
      name: c.name ?? null,
    };
  };

  for (const entry of squad) {
    let hit: MatchChip | undefined;
    if (entry.serialNo != null) {
      const exact = bySerial.get(`${entry.templateId}#${entry.serialNo}`);
      if (exact && !used.has(exact.id) && Number(exact.level) === Number(entry.level)) hit = exact;
    }
    if (!hit) {
      const list = pool.get(key(entry.templateId, entry.level)) ?? [];
      hit = list.find((c) => !used.has(c.id));
    }
    if (hit) picked.push(take(hit));
    else missing.push(entry);
  }

  return { picked, missing };
}

/**
 * Что из отряда пропало насовсем: фишку сожгли в крафте, продали или вывели
 * в NFT. Отдыхающих и оглушённых сюда пускать нельзя — они вернутся сами.
 */
export function staleEntries(squad: SquadEntry[], ownedAnyState: MatchChip[]): SquadEntry[] {
  return matchSquadToChips(squad, ownedAnyState).missing;
}
