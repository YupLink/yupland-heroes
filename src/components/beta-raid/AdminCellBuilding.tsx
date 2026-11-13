// Постройка в окне клетки админа: строка состава с обликом и настройки по
// поведению (табличка, грядка, шахта, портал, лавка, ратуша…).
//
// Вынесено из AdminCellState (правило ≤250 строк) без изменения поведения;
// новое здесь — «Переместить» (перенос здания, god-move/useGodMove). Строка и
// настройки — два компонента: между ними в окне стоит строка корабля.
import { Move } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { categoryLabelOf } from "@/lib/buildingCategory";
import { godText } from "@/components/beta-raid/adminCellText";
import { Row, btn } from "@/components/beta-raid/AdminCellRow";
import { AdminSkinPicker } from "@/components/beta-raid/AdminSkinPicker";
import { AdminBuildingName } from "@/components/beta-raid/AdminBuildingName";
import { AdminBuildingTags } from "@/components/beta-raid/AdminTagChecks";
import { AdminSignEditor } from "@/components/beta-raid/AdminSignEditor";
import { AdminEffectPicker } from "@/components/beta-raid/AdminEffectPicker";
import { AdminFieldEditor } from "@/components/beta-raid/AdminFieldEditor";
import { AdminMineEditor } from "@/components/beta-raid/AdminMineEditor";
import { AdminPortalEditor } from "@/components/beta-raid/AdminPortalEditor";
import { AdminServiceEditor } from "@/components/beta-raid/AdminServiceEditor";
import { MarketEditor } from "@/components/beta-raid/market/MarketEditor";
import { TownAdminPanel } from "@/components/beta-raid/town/TownAdminPanel";
import { BuildingPresetSave } from "@/components/beta-raid/building-sale/BuildingPresetSave";
import type { AdminCellComposed } from "@/components/beta-raid/useAdminCellView";
import type { CellPatch } from "@/components/beta-raid/patchMapCache";

type Put = (patch: Omit<CellPatch, "q" | "r">) => void;

/** Строка «Постройка»: имя, тир, «−/+», «Переместить», «Убрать», метки — и облик. */
export function AdminBuildingRow({
  cell,
  onPut,
  onMove,
}: {
  cell: AdminCellComposed;
  onPut: Put;
  /** Взять здание для переноса; null — переносить пока нечем (id не известен). */
  onMove: (() => void) | null;
}) {
  const t = godText(useLang());
  const tr = useT();
  const b = cell.building;
  if (!b) return null;
  // Потолок «+» — по числу тиров шаблона. Неизвестно (0) — «+» не даём:
  // тир, которого у постройки нет, делает её на карте невидимой.
  const maxTier = b.tiers > 0 ? b.tiers - 1 : 0;
  return (
    <>
      <Row label={t.rowBuilding}>
        {/* Правка имени: у скин-клетки правится ИМЯ облика (не базы),
            у обычной — имя базы (шаблона). */}
        <AdminBuildingName
          baseId={b.baseId}
          baseName={b.baseName}
          skinId={b.skinId}
          skinName={b.skinName}
        />
        <span className="text-muted-foreground">
          · {t.tierOf(b.tier + 1, b.tiers > 0 ? b.tiers : "?")}
        </span>
        <button
          type="button"
          disabled={b.tier <= 0}
          className={btn}
          onClick={() => onPut({ tier: Math.max(0, b.tier - 1) })}
        >
          −
        </button>
        <button
          type="button"
          disabled={b.tier >= maxTier}
          title={b.tiers > 0 ? undefined : t.tiersUnknown}
          className={btn}
          onClick={() => onPut({ tier: b.tier + 1 })}
        >
          +
        </button>
        <button type="button" disabled={!onMove} className={btn} onClick={() => onMove?.()}>
          <span className="inline-flex items-center gap-1">
            <Move className="h-3 w-3" /> {tr("godmove.move")}
          </span>
        </button>
        <button type="button" className={btn} onClick={() => onPut({ buildingId: null })}>
          {t.remove}
        </button>
        <AdminBuildingTags baseId={b.baseId} skinId={b.skinId} />
      </Row>

      {/* Облик постройки: вид клетки в рамках ЕЁ категории. Показываем только на
          клетке с постройкой (категорию берём из её имени) — облики другой
          категории сюда не попадают. Пустую клетку сперва застраивают. */}
      <AdminSkinPicker
        q={cell.q}
        r={cell.r}
        buildingName={b.name}
        skinId={b.skinId}
        baseId={b.baseId}
        onApply={onPut}
      />
    </>
  );
}

/** Настройки постройки по её поведению — там же, где она стоит. */
export function AdminBuildingSettings({ cell, onPut }: { cell: AdminCellComposed; onPut: Put }) {
  const b = cell.building;
  if (!b) return null;
  const own = (b.config as { effect?: unknown } | null)?.effect;

  // Конфиг клетки уходит на сервер целиком (building_config = <новый>), поэтому
  // правку одной настройки сливаем с уже лежащими: иначе «назначил поведение»
  // стирало бы надпись таблички и настройку шахты.
  const putConfig = (patch: Record<string, unknown>) =>
    onPut({
      buildingConfig: {
        ...((b.config as Record<string, unknown> | null) ?? {}),
        ...patch,
      },
    });

  return (
    <>
      {/* Табличка подписывается прямо здесь — ещё до выгрузки. */}
      {b.effect === "sign" && (
        <AdminSignEditor
          text={b.text}
          queued={b.textQueued}
          onSave={(text) => putConfig({ text })}
        />
      )}

      {/* Поведение клетки: одна «Площадка» может быть грядкой здесь и складом
          там — раньше это задавалось только у шаблона, скопом. Показываем у
          ЛЮБОЙ постройки (владелец, 05.10.2026): «Ратуша»-картинка без
          поведения иначе не превращалась в ратушу прямо на карте — режим бога
          «не позволял редачить ратушу». */}
      <AdminEffectPicker
        effect={b.effect}
        typeLabel={categoryLabelOf(b.name)}
        ownEffect={typeof own === "string" ? String(own) : null}
        onPick={(next) => putConfig({ effect: next })}
      />

      {/* Грядка настраивается тут же: что растёт и кого пускают батрачить. */}
      {b.effect === "field" && (
        <AdminFieldEditor
          config={b.config as Record<string, unknown> | null}
          onSave={(patch) => putConfig(patch)}
        />
      )}

      {/* Шахта настраивается прямо на живой карте — режим бога. */}
      {b.effect === "mine" && (
        <AdminMineEditor config={b.config} onSave={(flat) => putConfig(flat)} />
      )}

      {/* Портал — тоже режим бога: сеть, уровень героя и цена прохода. */}
      {b.effect === "portal" && (
        <AdminPortalEditor config={b.config} onSave={(patch) => putConfig(patch)} />
      )}

      {/* Алтарь, столб заклинаний, покои, «Забвение»: что дают и почём — там
          же, где стоят (AdminServiceEditor выбирает по поведению). */}
      <AdminServiceEditor effect={b.effect} config={b.config} onSave={putConfig} />

      {b.effect === "market" && <MarketEditor q={cell.q} r={cell.r} />}
      {/* Лавка построек — та же витрина, товар — постройка с настройкой (lib/buildingSale). */}
      {b.effect === "building_shop" && <MarketEditor q={cell.q} r={cell.r} buildingShop />}

      {/* Ратуша: настройки жителей, товаров, цен — в том же окне «Правка на
          живой карте», рядом с полем эффекта. Раньше открывались отдельной
          модалкой TownAdminPanel по тапу на клетку, но админ ищет их там, где
          выставил Ратушу — не должен гадать, где же настройки. */}
      {b.effect === "town_hall" && (
        <TownAdminPanel q={cell.q} r={cell.r} onClose={() => undefined} embedded />
      )}

      {/* Настроенную постройку — шаблоном в лавку построек (lib/buildingSale). */}
      <BuildingPresetSave q={cell.q} r={cell.r} effect={b.effect} name={b.name} />
    </>
  );
}
