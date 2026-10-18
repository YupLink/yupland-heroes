// ЗАБЫТЬ заклинание: у столба — за «Цену забвения», из книги — эффектом «Забвение».
//
// 27.09 забвение было сделано даром и откуда угодно; владелец это отменил:
// «сделай, чтобы было как поведение для постройки — чтобы можно было выстроить
// цену и ресурс». Теперь:
//   • у столба — как до того дня: только если в его настройке задана «Цена
//     забвения», и за неё (spell-forget-pillar.ts); нет цены — отказ
//     spell.pillar_no_forget;
//   • из книги героя — только пока на игроке висит эффект «Забвение»: заряды,
//     заряды со сроком или время (oblivion-forget.ts, модель —
//     lib/hero/boostOblivion.ts).
// Ручка одна — forgetSpell в spell-learn.ts, адрес у старых вкладок прежний.
// Столб присылает клетку и ключ нажатия, книга — нет: по ним и развилка.
// Вкладка сборки «даром» шлёт {spellId, heroId} и из книги, и от столба — и
// попадает в забвение эффектом: без эффекта даром уже ничего не уйдёт.
//
// Общее у обоих путей: строка книги уходит одним оператором вместе с проверкой,
// что герой свой (account_id); слепой повтор моста не забывает и не платит
// второй раз; откат (hero_spell_cd) не трогается — «забыл → выучил заново»
// ждёт тот же откат, а изучение у столба платное по своему ключу нажатия.
import { z } from "zod";
import { forgetAtPillar } from "@/server/api/beta-raid/spell-forget-pillar";
import { forgetByOblivion } from "@/server/api/beta-raid/oblivion-forget";
import type { LearnResult } from "@/server/api/beta-raid/spell-learn";
import { HERO_RESTING, heroIsResting } from "@/server/api/hero-rest";

export const forgetInput = (d: unknown) =>
  z
    .object({
      spellId: z.string().min(1).max(120),
      /** Чью книгу видит игрок. Нет — книга выбранного героя. */
      heroId: z.string().trim().min(1).max(120).optional(),
      /** Клетка столба: есть — забвение у столба за его цену. */
      q: z.number().int().optional(),
      r: z.number().int().optional(),
      /** Ключ нажатия у столба: он же ключ оплаты. */
      op: z.string().max(80).optional(),
    })
    // Столб без ключа нажатия не забывает: по ключу и платят, и отсекают повтор.
    .refine((v) => v.q === undefined || (v.op ?? "").length >= 6, { message: "op required" })
    .parse(d);

export type ForgetInput = ReturnType<typeof forgetInput>;

/** У столба (клетка пришла) — за цену; иначе — эффектом «Забвение». */
export async function forgetSpellFor(wallet: string, data: ForgetInput): Promise<LearnResult> {
  // Отдыхающий герой ничего не делает — и не забывает (hero-rest.ts). Без
  // heroId книга — основного, а основным отдыхающий не бывает.
  if (data.heroId && (await heroIsResting(data.heroId))) {
    return { ok: false, reasonKey: HERO_RESTING };
  }
  if (typeof data.q === "number" && typeof data.r === "number") {
    return forgetAtPillar(wallet, { ...data, q: data.q, r: data.r, op: data.op ?? "" });
  }
  return forgetByOblivion(wallet, data);
}
