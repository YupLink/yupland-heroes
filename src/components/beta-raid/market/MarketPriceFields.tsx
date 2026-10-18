// Блок цены товара маркета (админ): «Тип оплаты» + подчинённые поля.
//
// Разложено так же, как «Тип товара»: сверху крупный выбор (Ресурс / Пак /
// Герой / Артефакт / Босс / Свой товар), под ним — конкретика. Ресурс — тот же
// список валют, что игроки знают по счёту; Токен — символ монеты (DARAI);
// «предметные» типы — пикер шаблона.
import {
  MARKET_RESOURCE_GOODS,
  RESOURCE_LABELS_RU,
  type MarketKind,
  type MarketPriceResource,
} from "@/lib/marketItem";
import { MarketRefPicker } from "./MarketRefPicker";
import { NumField } from "./NumField";

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/** Верхняя группа: «Ресурс» и «предметные» kind'ы. Один стандарт с товаром. */
type PayKind = "resource" | "pack" | "hero" | "art" | "boss" | "custom";
const PAY_KIND_LABEL: Record<PayKind, string> = {
  resource: "Ресурс",
  pack: "Пак",
  hero: "Герой",
  art: "Артефакт",
  boss: "Босс",
  custom: "Свой товар",
};
const PAY_KINDS: PayKind[] = ["resource", "pack", "hero", "art", "boss", "custom"];

/** Как решить, какой верхний выбор сейчас показывать по имеющемуся resource. */
function payKindOf(resource: MarketPriceResource): PayKind {
  if (
    resource === "pack" ||
    resource === "hero" ||
    resource === "art" ||
    resource === "boss" ||
    resource === "custom"
  ) {
    return resource;
  }
  return "resource";
}

export function MarketPriceFields({
  sell,
  noArtAny,
  priceResource,
  priceAmount,
  priceToken,
  tokens,
  onResource,
  onAmount,
  onToken,
}: {
  /** Витрина скупки: эта «цена» — то, что магазин ПЛАТИТ игроку. */
  sell?: boolean;
  /** Запретить «любой арт редкости» — вторая цена без выбора игрока. */
  noArtAny?: boolean;
  priceResource: MarketPriceResource;
  priceAmount: number;
  priceToken: string | null;
  tokens: string[];
  onResource: (v: MarketPriceResource) => void;
  onAmount: (v: number) => void;
  onToken: (v: string | null) => void;
}) {
  const payKind = payKindOf(priceResource);
  const isResource = payKind === "resource";

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {sell ? "Чем платим" : "Тип оплаты"}
          </span>
          <select
            value={payKind}
            onChange={(e) => {
              const kind = e.target.value as PayKind;
              // Переключились на «Ресурс» — сбрасываем на золото и стираем
              // символ (у ресурса он не нужен). Переключились на «предметный» —
              // resource = сам kind, а конкретный шаблон выберет пикер ниже.
              if (kind === "resource") {
                onResource("gold");
                onToken(null);
              } else {
                onResource(kind as unknown as MarketPriceResource);
                onToken(null);
              }
            }}
            className={inp}
          >
            {PAY_KINDS.map((k) => (
              <option key={k} value={k}>
                {PAY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {sell ? "Сколько" : "Цена"}
          </span>
          {/* Цена — единственное дробное число сделки: «1 молоко за 0,1 золота».
              Через NumField, а не type=number: андроид-клавиатура ставит запятую,
              и браузер отдавал такое поле пустым (цена уезжала прежней). */}
          <NumField
            value={priceAmount || null}
            onChange={(v) => onAmount(v ?? 0)}
            className={`${inp} tabular-nums`}
          />
        </label>
      </div>

      {isResource && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Ресурс</span>
          <select
            value={priceResource}
            onChange={(e) => {
              onResource(e.target.value as MarketPriceResource);
              // Меняем ресурс — сбрасываем символ. Если новый = token, поле
              // «Какой токен» проявится ниже и админ выберет символ.
              onToken(null);
            }}
            className={inp}
          >
            {MARKET_RESOURCE_GOODS.map((res) => (
              <option key={res} value={res}>
                {RESOURCE_LABELS_RU[res]}
              </option>
            ))}
          </select>
        </label>
      )}

      {isResource && priceResource === "token" && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Какой токен
          </span>
          <select
            value={priceToken ?? ""}
            onChange={(e) => onToken(e.target.value || null)}
            className={inp}
          >
            <option value="">— какой токен —</option>
            {tokens.map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>
        </label>
      )}

      {!isResource && (
        <div className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {payKind === "custom" ? "Шаблон товара" : "Что именно"}
          </span>
          <MarketRefPicker
            kind={payKind as unknown as MarketKind}
            value={priceToken}
            onPick={(ref) => onToken(ref.id)}
            noArtAny={noArtAny}
          />
        </div>
      )}
    </>
  );
}
