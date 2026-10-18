// Что окно постройки показывает про университет.
//
// Отдельным модулем по той же причине, что и маркет: building-extra держит все
// постройки разом и упирается в лимит файла (§ модульность).
//
// Университету, в отличие от верфи и вышки, безразлично «достроен ли он»:
// первый тир — стройка, а дальше каждый следующий тир и есть уровень, который
// увеличивает доход. Поэтому здесь считается уровень, а не признак готовности.
import { universityLevel, universityBonus } from "@/lib/university";
import type { BuildingExtra } from "@/lib/buildingEffect";

export async function universityExtra(opts: {
  wallet: string;
  tier: number;
}): Promise<BuildingExtra> {
  const level = universityLevel(opts.tier);
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(opts.wallet).catch(() => null);
  let staked = 0;
  let pending = 0;
  if (account && level > 0) {
    const { universityAccount } = await import("./university-state");
    // Чтение заодно пересчитывает накопленное — окно показывает свежее число,
    // а не то, что было на момент последнего действия.
    const acc = await universityAccount(account).catch(() => null);
    staked = acc?.chips.length ?? 0;
    pending = acc?.pending ?? 0;
  }
  return { kind: "university", level, bonus: universityBonus(level), staked, pending };
}
