// Наполнитель награды: какие бывают и что в нём обязано лежать.
//
// Виды делятся на два лагеря. «Старые» (лайки, билеты, энергия, токен) несут
// только сумму. Новые — РЕСУРС единого счёта (золото/камень/дерево/алмазы) и
// СВОЙ ТОВАР из справочника (Пшеница, Молоко, Слиток железа) — обязаны нести
// ссылку: код ресурса или id товара. Без неё награда доехала бы до выдачи и
// превратилась в вечную заявку в очереди, поэтому мусор умирает ЗДЕСЬ, на
// разборе, а не при клейме.
//
// Токен (Darai) видом "resource" НЕ выдаём намеренно: у него свой путь через
// acc_move и залог свободного пула карты (token-free-pool читает филлеры с
// kind='token'). Ресурс счёта такого обеспечения не требует, и смешать их
// значило бы раздавать Darai мимо залога.

// Белый список ресурсов — ОДИН на админку, показ и выдачу (@/lib/rewardKinds):
// он же в точности повторяет условие yuplink.res_move, которая на чужом коде
// бросает исключение. Своя копия здесь означала бы, что админ сохраняет вид,
// который база потом откажется зачислять.
export { REWARD_RESOURCES, isRewardResource, type RewardResource } from "@/lib/rewardKinds";
import { isRewardResource, type RewardResource } from "@/lib/rewardKinds";

export type FillerKind = "likes" | "tickets" | "energy" | "token" | "resource" | "custom";

export type Filler = {
  kind: FillerKind;
  amount: number;
  /** kind:"token" — символ монеты (Darai, GDarai…). */
  token?: string | null;
  /** kind:"resource" — код ресурса единого счёта. */
  resource?: RewardResource | null;
  /** kind:"custom" — id товара справочника yuplink.raid_custom_item (cst_…). */
  itemId?: string | null;
  /** kind:"custom" — штучно первым N местам, как пак. По умолчанию первому. */
  toPlace?: number | null;
};

/** Ресурс и свой товар — «ссылочные» виды: их ведёт отдельная ветка выдачи. */
export function isExtraFiller(f: { kind: string }): boolean {
  return f.kind === "resource" || f.kind === "custom";
}

/** Ссылка наполнителя: код ресурса или id товара. У старых видов — null. */
export function fillerRef(f: Filler): string | null {
  if (f.kind === "resource") return f.resource ?? null;
  if (f.kind === "custom") return f.itemId ?? null;
  return null;
}

/**
 * Разбор ОДНОГО наполнителя. null — мусор: ресурс с чужим кодом, свой товар
 * без префикса cst_. Такой филлер до очереди наград не доходит.
 *
 * Старые виды разбираются ровно как раньше — включая неизвестный kind, который
 * исторически проходил насквозь (символ монеты в старых конфигах).
 */
export function parseFiller(raw: Record<string, unknown>): Filler | null {
  const kind = (raw.kind as FillerKind) || "likes";
  const amount = Number(raw.amount) || 0;
  if (kind === "resource") {
    const code = typeof raw.resource === "string" ? raw.resource.trim() : "";
    if (!isRewardResource(code)) return null;
    return { kind, amount, token: null, resource: code };
  }
  if (kind === "custom") {
    const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
    if (!itemId.startsWith("cst_")) return null;
    const place = Number(raw.toPlace);
    return {
      kind,
      amount,
      token: null,
      itemId,
      toPlace: Number.isFinite(place) && place >= 1 ? Math.floor(place) : 1,
    };
  }
  return { kind, amount, token: (raw.token as string) ?? null };
}
