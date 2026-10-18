// «Где мои вещи»: список складов игрока с координатами клетки.
//
// Складов на карте много, а окно показывает только тот, у которого стоишь.
// Игроки просили список — что и где осталось лежать. Показываем только личные
// ячейки: общая полка ничья, её содержимое может исчезнуть в любую секунду.
import { useQuery } from "@tanstack/react-query";
import { Warehouse } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { qtyText } from "@/lib/qtyPick";
import { myWarehouses } from "@/server/api/beta-raid/warehouse-mine";

export function MyWarehousesList({
  /** Тап по координате: везёт камеру к складу (окно замка закрывает родитель). */
  onShowCell,
}: {
  onShowCell?: (q: number, r: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  // Список — про чужие места, куда игрок пойдёт ногами: цифра обязана быть
  // свежей на момент открытия, а не из persist-кэша получасовой давности
  // (владелец 21.09: «написано 114, подошёл — 48»: полку подрезали и часть
  // ушла на общую, а список ещё показывал старое). Открыл — перечитали.
  const listQ = useQuery({
    queryKey: ["my-warehouses"],
    queryFn: () => myWarehouses(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const list = listQ.data?.list ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        {t("braid.wh_my_list")}
      </div>
      {listQ.isPending && <p role="status" className="text-xs text-muted-foreground">{lang === "ru" ? "Загрузка складов…" : "Loading warehouses…"}</p>}
      {listQ.isError && (
        <div role="alert" className="space-y-1 text-xs text-destructive">
          <p>{lang === "ru" ? "Не удалось загрузить мои склады." : "Could not load my warehouses."}</p>
          <button type="button" onClick={() => void listQ.refetch()} className="min-h-11 underline" disabled={listQ.isFetching}>
            {lang === "ru" ? "Повторить" : "Retry"}
          </button>
        </div>
      )}
      {listQ.isSuccess && list.length === 0 && <p className="text-xs text-muted-foreground">{lang === "ru" ? "На складах карты пока нет твоих предметов." : "You have no items in map warehouses yet."}</p>}
      <div className="space-y-1">
        {list.map((w) => (
          <div key={`${w.q}:${w.r}`} className="rounded-xl border border-border/60 px-2.5 py-1.5">
            {/* Координата — кнопка, как CellLink в «Добыче»: игроки жаловались,
                что «Клетка -43:94» не нажимается и до склада не доехать. */}
            {onShowCell ? (
              <button
                type="button"
                onClick={() => onShowCell(w.q, w.r)}
                className="text-[11px] font-bold tabular-nums text-gold underline decoration-dotted underline-offset-2"
              >
                {t("braid.wh_at_cell", { q: w.q, r: w.r })}
              </button>
            ) : (
              <div className="text-[11px] font-bold tabular-nums text-gold">
                {t("braid.wh_at_cell", { q: w.q, r: w.r })}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              {w.items.map((it) => (
                <span key={it.stackKey} className="truncate">
                  {/* Как на плитке склада: крошка 0,000455 — не «0». */}
                  {it.name} · <span className="tabular-nums">{qtyText(it.count, lang, 2)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
