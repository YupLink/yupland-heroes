// Постройка на клетке: что с ней можно сделать в режиме правки.
//
// Раньше тап по клетке с постройкой открывал выбор объекта (босс/сундук/…) —
// саму постройку было не поправить и не снять, только ластиком. Теперь по ней
// открывается это окно: правка тиров шаблона и снятие с клетки.
import { Box, Hammer, Pencil, ScrollText, Sprout, Trash2, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { TreePricesEditor } from "./TreePricesEditor";
import { MineConfigEditor } from "./MineConfigEditor";
import { PortalConfigEditor } from "./PortalConfigEditor";
import { MarketEditor } from "@/components/beta-raid/market/MarketEditor";
import type { ServicePrice } from "@/lib/buildingEffect";
import type { MineConfig } from "@/lib/mineConfig";
import type { FieldConfig } from "@/lib/fieldConfig";
import { FieldConfigEditor } from "./FieldConfigEditor";
import type { PortalConfig } from "@/lib/portal";
import type { BoostCellConfig } from "@/lib/boostConfig";
import { BoostConfigEditor } from "./BoostConfigEditor";

export type BuildingBrief = {
  id: string;
  name: string;
  /** Картинки тиров — по ним видно, во что постройка вырастет. */
  tierImages: string[];
  /** Эффект постройки: у дерева здесь настраивается цена прокачки. */
  effect: string | null;
};

export function BuildingCellEditor({
  building,
  q,
  r,
  prices,
  tokens,
  signText,
  mineConfig,
  fieldConfig,
  portalConfig,
  mapId,
  boostConfig,
  onPricesChange,
  onSignTextChange,
  onMineConfigChange,
  onFieldConfigChange,
  onPortalConfigChange,
  onBoostConfigChange,
  onEditTemplate,
  onEditObject,
  onRemove,
  onClose,
}: {
  building: BuildingBrief | null;
  q: number;
  r: number;
  /** Цены прокачки ЭТОГО дерева (пусто — берутся общие из шаблона). */
  prices: ServicePrice[];
  /** Надпись ЭТОЙ таблички: у каждой своя, как и цена у дерева. */
  signText: string;
  /** Настройка добычи ЭТОЙ шахты (ресурс/выход/цена захвата). */
  mineConfig: MineConfig;
  fieldConfig: FieldConfig;
  /** Настройка портала ЭТОЙ клетки: комната, уровень героя, цена прохода. */
  portalConfig: PortalConfig;
  /** Карта в редакторе — её комнаты порталу предлагаются первыми. */
  mapId: string | null;
  /** Настройка алтаря ЭТОЙ клетки: характеристика, вилка прибавки и цена. */
  boostConfig: BoostCellConfig;
  tokens: string[];
  onPricesChange: (next: ServicePrice[]) => void;
  onSignTextChange: (next: string) => void;
  onMineConfigChange: (next: MineConfig) => void;
  onFieldConfigChange: (next: FieldConfig) => void;
  onPortalConfigChange: (next: PortalConfig) => void;
  onBoostConfigChange: (next: BoostCellConfig) => void;
  onEditTemplate: () => void;
  /** На клетке есть ещё и объект — без этой кнопки к нему было не подобраться. */
  onEditObject: (() => void) | null;
  onRemove: () => void;
  onClose: () => void;
}) {
  const isTree = building?.effect === "leveltree";
  const isSign = building?.effect === "sign";
  const isMine = building?.effect === "mine";
  // Грядка настраивается тем же редактором: у неё те же поля — что растёт и
  // сколько за час. Цена захвата у поля не спрашивается: его не захватывают.
  const isField = building?.effect === "field";
  const isMarket = building?.effect === "market";
  const isPortal = building?.effect === "portal";
  const isBoost = building?.effect === "boost";
  // Покои: цены — тот же список ServicePrice[], редактор дерева уровней
  // работает с ним без изменений; отличаются только подпись и ключ в конфиге.
  const isChambers = building?.effect === "chambers";
  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[90vh] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Постройка · {q}, {r}
            </div>
            <h3 className="truncate font-display text-lg font-bold">
              {building?.name ?? "Неизвестная постройка"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {building && building.tierImages.length > 0 && (
          <div className="mb-3 flex items-center justify-center gap-2">
            {building.tierImages.map((src, i) => (
              <img
                key={i}
                src={thumb(src, 56)}
                alt=""
                className="h-14 w-14 rounded-lg border border-border object-contain"
              />
            ))}
          </div>
        )}

        {/* Покои: цены отдыха ЭТИХ покоев. Формат — тот же ServicePrice[]. */}
        {isChambers && (
          <>
            <p className="mb-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-gold">
              <Sprout className="h-3 w-3" />
              Цены отдыха в ЭТИХ покоях · применится после «Сохранить» карты
            </p>
            <TreePricesEditor prices={prices} tokens={tokens} onChange={onPricesChange} />
            {prices.length === 0 && (
              <p className="mb-3 text-center text-[11px] text-muted-foreground">
                Пока цен нет — покои закрыты, снимать эффекты негде.
              </p>
            )}
          </>
        )}

        {/* Дерево настраивается прямо здесь: цена у каждого своя. */}
        {isTree && (
          <>
            <p className="mb-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-emerald-300">
              <Sprout className="h-3 w-3" />
              Цена прокачки ЭТОГО дерева · применится после «Сохранить» карты
            </p>
            <TreePricesEditor prices={prices} tokens={tokens} onChange={onPricesChange} />
            {prices.length === 0 && (
              <p className="mb-3 text-center text-[11px] text-muted-foreground">
                Пока цен нет, дерево берёт общие цены шаблона. Нет и там — игрок им не
                воспользуется.
              </p>
            )}
          </>
        )}

        {/* Портал: сеть, уровень героя и цена прохода — у каждого свои. */}
        {isPortal && (
          <PortalConfigEditor
            config={portalConfig}
            tokens={tokens}
            mapId={mapId}
            onChange={onPortalConfigChange}
          />
        )}

        {/* Алтарь-буст: что даёт герою и почём. */}
        {isBoost && (
          <BoostConfigEditor config={boostConfig} tokens={tokens} onChange={onBoostConfigChange} />
        )}

        {/* Шахта: добыча и цена захвата. */}
        {isMine && (
          <MineConfigEditor config={mineConfig} tokens={tokens} onChange={onMineConfigChange} />
        )}

        {/* Грядка: своя настройка — что растёт и кого пускают батрачить. */}
        {isField && (
          <FieldConfigEditor config={fieldConfig} tokens={tokens} onChange={onFieldConfigChange} />
        )}

        {/* Маркет: витрина товаров ЭТОЙ клетки (уходят сразу, не по «Сохранить»). */}
        {isMarket && <MarketEditor q={q} r={r} />}

        {/* Табличка подписывается здесь же: надпись у каждой своя. */}
        {isSign && (
          <label className="mb-3 block">
            <span className="mb-1 flex items-center justify-center gap-1 text-center text-[11px] text-gold">
              <ScrollText className="h-3 w-3" />
              Надпись ЭТОЙ таблички · применится после «Сохранить» карты
            </span>
            <textarea
              value={signText}
              onChange={(e) => onSignTextChange(e.target.value)}
              rows={3}
              placeholder="Что прочитает подошедший герой"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onEditTemplate}
            disabled={!building}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Изменить тиры и цены
          </button>
          {onEditObject && (
            <button
              type="button"
              onClick={onEditObject}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold"
            >
              <Box className="h-4 w-4" />
              Настроить объект на этой клетке
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-3 text-sm font-semibold text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Убрать постройку с клетки
          </button>
          <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
            <Hammer className="h-3 w-3" />
            Правка тиров и общих цен меняет шаблон везде, где он стоит
          </p>
        </div>
      </div>
    </div>
  );
}
