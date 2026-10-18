// Полная настройка объекта на клетке — та же форма, что в редакторе карт.
//
// В режиме бога правки нужны не только «поставить/убрать»: у босса это HP,
// урон, награды и способности, у сундука — цена входа и лут. Форму не
// переписываем, а берём редакторскую и кладём результат в общую очередь: пока
// админ правит, ничего никуда не уезжает — всё уходит по «Выгрузить».
//
// Форма заполняет поля из справочников ОДИН раз, на первом рендере: открытая
// раньше, чем они приехали, она встаёт на дефолтах (HP 100 000, наград нет), и
// «Сохранить» увозит их поверх настоящих настроек живого босса. Поэтому здесь
// сначала ждём те же запросы, что она делает внутри, и только потом рисуем её.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminListItems } from "@/server/api/items";
import { adminListBossTemplates } from "@/server/api/raid-admin";
import { adminListRewardTokens } from "@/server/api/boss";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import type { CellObjectConfig } from "@/server/api/beta-raid/admin-live-read";
import { FullObjectEditor } from "@/components/admin/hex-editor/FullObjectEditor";
import type { TerrainDef } from "@/components/admin/hex-editor/hexShared";
import type { AdminObjectRef } from "./adminObjectId";

/** Окно-заглушка на время ожидания и на случай пропавшего шаблона. */
function Notice({
  children,
  close,
  onClose,
}: {
  children: React.ReactNode;
  close: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-gold/30 bg-card p-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold"
        >
          {close}
        </button>
      </div>
    </div>
  );
}

export function AdminObjectSettings({
  q,
  r,
  object,
  cellConfig,
  onQueue,
  onClose,
}: {
  q: number;
  r: number;
  /** Разобранный объект клетки: вид и id шаблона. */
  object: AdminObjectRef;
  /** Правки объекта на этой клетке: сохранённые или ещё не выгруженные. */
  cellConfig: CellObjectConfig | null;
  /** Записать настройки в очередь правок этой клетки. */
  onQueue: (cfg: Record<string, unknown> | null) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const t = godText(useLang());
  const { sub, refId } = object;
  // Ключи ровно те же, что внутри FullObjectEditor: лишнего запроса не будет,
  // а к её первому рендеру всё уже лежит в кэше.
  const bossQ = useQuery({
    queryKey: ["hex-editor-boss-templates"],
    queryFn: () => adminListBossTemplates(),
  });
  const itemsQ = useQuery({
    queryKey: ["hex-editor-items", sub],
    queryFn: () => adminListItems({ data: { kind: sub } }),
  });
  const tokensQ = useQuery({
    queryKey: ["reward-tokens", "symbols"],
    queryFn: () => adminListRewardTokens(),
  });
  const terrainsQ = useQuery({
    queryKey: ["hex-editor-items", "terrain"],
    queryFn: () => adminListItems({ data: { kind: "terrain" } }),
    staleTime: 5 * 60_000,
  });

  const waiting = bossQ.isPending || itemsQ.isPending || tokensQ.isPending || terrainsQ.isPending;
  if (waiting) {
    return (
      <Notice close={t.close} onClose={onClose}>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t.objectLoading}
        </p>
      </Notice>
    );
  }

  // Шаблона нет — форма открылась бы пустой, и «Сохранить» записал бы на
  // клетку выдуманные значения. Лучше честно ничего не открыть.
  const found =
    sub === "boss"
      ? bossQ.data?.templates?.some((t) => t.id === refId)
      : itemsQ.data?.some((i) => i.id === refId);
  if (!found) {
    return (
      <Notice close={t.close} onClose={onClose}>
        <p className="text-xs">
          {t.tplMissing} <b className="break-all">{refId}</b>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{t.tplMissingWhy}</p>
      </Notice>
    );
  }

  const terrains: TerrainDef[] = (terrainsQ.data ?? [])
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, label: t.name, file: t.imageUrl ?? "", cost: 1 }));

  return (
    <FullObjectEditor
      sub={sub}
      refId={refId}
      cellKey={`${q},${r}`}
      terrains={terrains}
      cellConfig={cellConfig}
      onClose={onClose}
      onUpdated={() => {
        // Карту НЕ перечитываем: полное чтение стоит секунды и стёрло бы
        // невыгруженные правки прямо из-под пальцев.
        qc.invalidateQueries({ queryKey: ["admin-cell", q, r] });
      }}
      onSaveToCell={onQueue}
    />
  );
}
