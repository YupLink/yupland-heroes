// Блок «что за товар» в форме позиции маркета (админ): тип, конкретный ресурс
// или шаблон, количество, подпись и картинка. Вынесено из MarketItemForm ради
// лимита ≤250 строк.
//
// Читается по стороне витрины: в покупке это то, что игрок ПОЛУЧИТ, в скупке —
// то, что он ОТДАСТ. Поля одни и те же.
import {
  MARKET_KINDS,
  MARKET_RESOURCE_GOODS,
  RESOURCE_LABELS_RU,
  normalizeGiveAmount,
  type MarketDraft,
  type MarketKind,
} from "@/lib/marketItem";
import { MarketRefPicker } from "./MarketRefPicker";
import { MarketImageInput } from "./MarketImageInput";
import { NumField } from "./NumField";

const KIND_LABEL: Record<MarketKind, string> = {
  resource: "Ресурс",
  pack: "Пак",
  hero: "Герой",
  art: "Артефакт",
  boss: "Босс",
  custom: "Свой товар",
};

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function MarketGoodFields({
  draft,
  set,
  tokens,
  sell,
}: {
  draft: MarketDraft;
  set: (patch: Partial<MarketDraft>) => void;
  tokens: string[];
  sell: boolean;
}) {
  const isRes = draft.kind === "resource";
  const isCustom = draft.kind === "custom";

  return (
    <>
      <label className="block">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted-foreground">
          {sell ? "Что скупаем" : "Тип товара"}
        </span>
        <select
          value={draft.kind}
          onChange={(e) => {
            const kind = e.target.value as MarketKind;
            // Имя сбрасываем: ресурс подпишется дефолтом (плейсхолдер/фолбэк),
            // шаблонные — именем шаблона при выборе (onPick).
            // Количество тоже: поле «Сколько» ниже показано только ресурсу, и
            // набранная для него дробь (0,5) уехала бы в артефакт вслепую —
            // позиция сохранилась бы, а каждая покупка падала бы.
            set({
              kind,
              refId: kind === "resource" ? "gold" : null,
              image: null,
              name: "",
              giveAmount: normalizeGiveAmount(kind, draft.giveAmount),
            });
          }}
          className={inp}
        >
          {MARKET_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      {isRes && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Ресурс</span>
            <select
              value={draft.refId ?? "gold"}
              onChange={(e) => set({ refId: e.target.value })}
              className={inp}
            >
              {MARKET_RESOURCE_GOODS.map((res) => (
                <option key={res} value={res}>
                  {RESOURCE_LABELS_RU[res]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Сколько
            </span>
            {/* Ресурс за сделку бывает дробным (0,5 энергии) — поле терпит и
                запятую: на телефоне другого разделителя на клавиатуре нет. */}
            <NumField
              value={draft.giveAmount || null}
              onChange={(v) => set({ giveAmount: v ?? 0 })}
              className={`${inp} tabular-nums`}
            />
          </label>
          {draft.refId === "token" && (
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                Какой токен
              </span>
              <select
                value={draft.giveToken ?? ""}
                onChange={(e) => set({ giveToken: e.target.value || null })}
                className={inp}
              >
                <option value="">— выбери токен —</option>
                {tokens.map((tk) => (
                  <option key={tk} value={tk}>
                    {tk}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {!isRes && (
        // Не <label>: label форвардил тап на кнопку-триггер (попап переоткрывался).
        // custom тоже через пикер: там можно выбрать готовый шаблон или создать
        // новый (картинка+имя сохраняются в raid_custom_item для повторного выбора).
        <div className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {isCustom ? "Шаблон товара" : "Что именно"}
          </span>
          <MarketRefPicker
            kind={draft.kind}
            value={draft.refId}
            onPick={(ref) => set({ refId: ref.id, name: draft.name || ref.name, image: ref.image })}
          />
        </div>
      )}

      {/* Подпись — у ресурса (можно «Продать Дерево» / «Купить Дерево») и у
          кастомного. У ресурса необязательна: пусто → подпись ресурса. Шаблонным
          (пак/герой/арт/босс) имя даёт шаблон — поля нет. */}
      {(isRes || isCustom) && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {isRes ? "Подпись (необязательно)" : "Название"}
          </span>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={
              isRes
                ? (RESOURCE_LABELS_RU[(draft.refId ?? "gold") as keyof typeof RESOURCE_LABELS_RU] ??
                  "как увидит игрок")
                : "как увидит игрок"
            }
            className={inp}
          />
        </label>
      )}

      {!isRes && !isCustom && (
        // Картинка пака/героя/арта берётся из шаблона; своя загрузка — только
        // когда нужна замена. У custom картинка приходит из шаблона.
        <MarketImageInput image={draft.image} onImage={(url) => set({ image: url })} />
      )}
    </>
  );
}
