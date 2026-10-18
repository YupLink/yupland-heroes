// Письма игрока: что показать при входе в игру и отметка «Понятно».
//
// Ключ — аккаунт (ПРАВИЛА: игрок = аккаунт, не кошелёк): прочитал с одного
// кошелька — с другого то же письмо не придёт. Без кошелька или аккаунта —
// писем нет (пустой список честнее ошибки поверх игры). Истёкшие («показывать
// до» в прошлом) отсекает сама выборка; язык выбирает окно игрока.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet } from "../../auth";
import { raidOwner } from "../beta-raid/owner";
import { textOrNull, type PlayerLetter } from "@/lib/letters";
import { markSeenSql, myLettersSql } from "./letters-sql";

type LetterDbRow = {
  id: string;
  title: string | null;
  body: string | null;
  image: string | null;
  title_en?: string | null;
  body_en?: string | null;
};

export const toPlayerLetter = (r: LetterDbRow): PlayerLetter => ({
  id: r.id,
  title: r.title ?? "",
  body: r.body ?? "",
  image: r.image?.trim() || null,
  titleEn: textOrNull(r.title_en),
  bodyEn: textOrNull(r.body_en),
});

/** Непрочитанные письма аккаунта — по порядку объявления. */
export async function loadMyLetters(account: string): Promise<PlayerLetter[]> {
  const rows = (await mcpExec(myLettersSql(account), { wrapJson: true })) as LetterDbRow[] | null;
  return (rows ?? []).map(toPlayerLetter);
}

export const getMyLetters = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlayerLetter[]> => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    let account: string;
    try {
      account = await raidOwner(wallet);
    } catch {
      return [];
    }
    return loadMyLetters(account);
  },
);

export const markLetterSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    const account = await raidOwner(wallet);
    await mcpExec(markSeenSql(data.id, account));
    return { ok: true };
  });
