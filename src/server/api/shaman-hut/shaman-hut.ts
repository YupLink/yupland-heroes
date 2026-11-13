// Окно «Хижина шаманов» и покупка шамана (владелец, 28.10.2026): «пока шаманов
// нельзя купить, но можно посмотреть … админ ставит цену — и начинает
// продаваться». Окно — шаман (картинка, имя, HP и урон, если заданы), сколько
// их в хижине и цена; цены нет — «Скоро в продаже».
//
// Покупка — одна функция базы castle_shaman_buy (shaman-01): списание ресурса
// счёта и +1 шаман под замком аккаунта, ключ повтора — нажатие (opId). Цену
// берём из настройки сервера, клиенту не верим.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "@/server/db/pg";
import { SHAMAN_ART, type ShamanPrice } from "@/lib/shamanHut";
import { hutPlayer, requireShamanHut } from "./shaman-own";
import { shamanCount } from "./shaman-stock";
import { loadShamanConfig } from "./shaman-config";
import { loadShamanTemplate, type ShamanTemplate } from "./shaman-template";

export type ShamanHutView = {
  /** Шаманов в хижине. */
  count: number;
  /** Цена одного; null — не продаётся. */
  price: ShamanPrice | null;
  shaman: Omit<ShamanTemplate, "id">;
};

/** Шаблона нет — показываем шамана без характеристик (только обряд погоды). */
const NO_TEMPLATE: Omit<ShamanTemplate, "id"> = {
  name: "Шаман",
  image: SHAMAN_ART,
  hp: 0,
  attack: null,
  guard: false,
};

export const getShamanHut = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShamanHutView> => {
    const { account } = await hutPlayer();
    await requireShamanHut(account);
    const [count, cfg, tpl] = await Promise.all([
      shamanCount(account),
      loadShamanConfig(),
      loadShamanTemplate(),
    ]);
    const shaman = tpl
      ? { name: tpl.name, image: tpl.image, hp: tpl.hp, attack: tpl.attack, guard: tpl.guard }
      : NO_TEMPLATE;
    return { count, price: cfg.price, shaman };
  },
);

/** Отказ базы — ключом перевода (humanError). */
export function shamanBuyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/res_move: в минус/.test(msg)) return new Error("shaman.no_resources");
  if (/shaman_no_hut/.test(msg)) return new Error("shaman.not_built");
  if (/shaman_no_price|shaman_bad_price/.test(msg)) return new Error("shaman.not_for_sale");
  return e instanceof Error ? e : new Error(msg || "Не удалось");
}

/** Купить одного шамана по цене админа. applied=false — повтор того же нажатия. */
export const buyShaman = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        opId: z.string().min(8).max(40),
        /** Цена, которую игрок видел: админ сменил её, пока окно открыто, — не списываем. */
        expect: z.object({ currency: z.string().max(16), amount: z.number() }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ count: number; applied: boolean }> => {
    const { account } = await hutPlayer();
    const { price } = await loadShamanConfig();
    if (!price) throw new Error("shaman.not_for_sale");
    if (
      data.expect &&
      (data.expect.currency !== price.currency || data.expect.amount !== price.amount)
    )
      throw new Error("shaman.price_changed");
    await requireShamanHut(account);
    const { error, data: rows } = await sb.rpc("castle_shaman_buy", {
      p_account: account,
      p_price: { [price.currency]: price.amount },
      p_op: `shm:${account}:${data.opId}`,
    });
    if (error) throw shamanBuyError(new Error(String(error.message ?? "")));
    const row = (rows as Array<{ shamans: number; applied: boolean }> | null)?.[0];
    return { count: Number(row?.shamans) || 0, applied: row?.applied === true };
  });
