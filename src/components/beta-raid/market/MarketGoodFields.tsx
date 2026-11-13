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
  isPlantKind,
} from "@/lib/marketItem";
import { MarketRefPicker } from "./MarketRefPicker";
import { MarketImageInput } from "./MarketImageInput";
import { NumField } from "./NumField";
import { VeinKindSelect } from "./VeinKindSelect";
import { VEIN_NAME_RU } from "@/lib/veinPlace";
import { RecipeOutcomesEditor } from "./RecipeOutcomesEditor";
import { recipeCover } from "@/lib/marketRecipe";
import { BUILDING_KIND } from "@/lib/buildingSale";
import { BuildingPresetPick } from "@/components/beta-raid/building-sale/BuildingPresetPick";
import { useBuildingShop } from "@/components/beta-raid/building-sale/buildingShopContext";

const KIND_LABEL: Record<MarketKind, string> = {
  resource: "Ресурс",
  pack: "Пак",
  hero: "Герой",
  art: "Артефакт",
  boss: "Босс",
  custom: "Свой товар",
  tree: "Дерево для посадки",
  rock: "Камень для установки",
  land: "Земля (мир строителей)",
  vein: "Жила (золото / алмазы)",
  recipe: "Рецепт (исход по шансам)",
  building: "Постройка (поставить в мире строителей)",
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
  // Жила — вид из двух (золото / алмазы) обычным списком, без пикера шаблонов.
  const isVein = draft.kind === "vein";
  // Рецепт — свой список исходов с шансами вместо одного шаблона (§8.104).
  const isRecipe = draft.kind === "recipe";
  // Лавка построек торгует только постройками; в обычной лавке постройки нет.
  const buildingShop = useBuildingShop();
  const isBuilding = draft.kind === BUILDING_KIND;
  const kinds = buildingShop
    ? [BUILDING_KIND]
    : MARKET_KINDS.filter(
        (k) =>
          k !== BUILDING_KIND &&
          // Дерево, камень, земля, жила и рецепт — только покупкой (tree-, land-, vein-admin).
          (!sell || (!isPlantKind(k) && k !== "land" && k !== "vein" && k !== "recipe")),
      );

  // Лавка построек: товар — шаблон постройки, настроенной на карте (имя и картинка — его).
  if (buildingShop) return <BuildingPresetPick draft={draft} set={set} />;

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
              refId: kind === "resource" || kind === "vein" ? "gold" : null,
              image: null,
              name: kind === "vein" ? VEIN_NAME_RU.gold : "",
              giveAmount: normalizeGiveAmount(kind, draft.giveAmount),
              outcomes: kind === "recipe" ? (draft.outcomes ?? []) : null,
              building: kind === BUILDING_KIND ? { skinId: null, config: null } : null,
            });
          }}
          className={inp}
        >
          {kinds.map((k) => (
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

      {isVein && (
        <VeinKindSelect
          value={draft.refId}
          onPick={(kind) => set({ refId: kind, name: VEIN_NAME_RU[kind] })}
        />
      )}

      {isRecipe && (
        <RecipeOutcomesEditor value={draft.outcomes ?? []} onChange={(v) => set({ outcomes: v })} />
      )}

      {!isRes && !isVein && !isRecipe && !isBuilding && (
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
            heroAny={sell}
            onPick={(ref) => set({ refId: ref.id, name: draft.name || ref.name, image: ref.image })}
          />
        </div>
      )}

      {(draft.kind === "land" || isVein) && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Клеток в пачке
          </span>
          <NumField
            value={draft.giveAmount || null}
            onChange={(v) => set({ giveAmount: Math.max(1, Math.floor(v ?? 1)) })}
            className={`${inp} tabular-nums`}
          />
        </label>
      )}

      {/* Подпись — у ресурса (можно «Продать Дерево» / «Купить Дерево») и у
          кастомного. У ресурса необязательна: пусто → подпись ресурса. Шаблонным
          (пак/герой/арт/босс) имя даёт шаблон — поля нет. */}
      {(isRes || isCustom || isRecipe) && (
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
        <MarketImageInput
          image={draft.image}
          fallback={isRecipe ? recipeCover(draft.outcomes) : null}
          onImage={(url) => set({ image: url })}
        />
      )}
    </>
  );
}
