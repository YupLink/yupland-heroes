// Удаление шаблона босса — с выбором, что делать с его копиями на карте.
//
// Шаблон и босс на карте — разные вещи: заготовку удаляют, чтобы она не мешала
// в списке, а не чтобы снести всё расставленное. Поэтому по умолчанию копии
// остаются (они переживут удаление по снимку — server/api/beta-raid/
// boss-snapshot.ts), а зачистка — отдельная осознанная галочка.
//
// Донастроенные клетки зачистка не трогает ни при каких галочках: там у босса
// свои HP и награды, и удаление ЗАГОТОВКИ про них ничего не говорит.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { adminBossTemplateUsage, adminDeleteBossTemplate } from "@/server/api/raid-boss-templates";

export function BossTemplateDeleteDialog({
  template,
  onClose,
  onDeleted,
}: {
  template: { id: string; name: string };
  onClose: () => void;
  /** Позвать после успешного удаления — обновить списки и снять кисть. */
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [removeCopies, setRemoveCopies] = useState(false);

  const usage = useQuery({
    queryKey: ["boss-template-usage", template.id],
    queryFn: () => adminBossTemplateUsage({ data: { id: template.id } }),
    staleTime: 0,
  });

  const del = useMutation({
    mutationFn: () => adminDeleteBossTemplate({ data: { id: template.id, removeCopies } }),
    onSuccess: (res) => {
      // Карта живёт в суточном кэше: без сброса убранные копии ещё несколько
      // минут висели бы на экране рейда (§ «Обновление страницы = табу»).
      qc.invalidateQueries({ queryKey: ["beta-raid-map"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["admin-live-assets", "boss"] });
      const kept = res.kept ?? 0;
      toast.success(
        res.removed > 0
          ? `Шаблон удалён, с карты убрано ${res.removed} копий${kept ? `, оставлено ${kept}` : ""}`
          : kept > 0
            ? `Шаблон удалён, ${kept} копий остались на карте`
            : "Шаблон удалён",
      );
      onDeleted();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось удалить"),
  });

  const u = usage.data;
  const busy = del.isPending || usage.isLoading;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-rose-500/40 bg-card pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-2xl sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Trash2 className="h-5 w-5 text-rose-400" />
          <span className="font-display text-lg font-bold">Удалить шаблон</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-sm">
          <p>
            Шаблон <span className="font-semibold text-gold">«{template.name}»</span> исчезнет из
            списка заготовок.
          </p>

          {usage.isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Считаю копии на картах…
            </p>
          )}

          {usage.isError && (
            <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
              Не удалось посчитать копии — удалять вслепую не стоит.
            </p>
          )}

          {u && u.total === 0 && (
            <p className="text-xs text-muted-foreground">На картах этот босс нигде не стоит.</p>
          )}

          {u && u.total > 0 && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
              <div className="text-xs">
                На карте: <span className="font-semibold text-foreground">{u.total}</span> копий, из
                них донастроенных вручную:{" "}
                <span className="font-semibold text-foreground">{u.custom}</span>
              </div>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {u.maps.map((m) => (
                  <li key={m.mapId}>
                    {m.name} — {m.total} кл.
                    {m.custom > 0 ? ` (донастроено ${m.custom})` : ""}
                  </li>
                ))}
              </ul>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-card p-2">
                <input
                  type="checkbox"
                  checked={removeCopies}
                  onChange={(e) => setRemoveCopies(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-rose-500"
                />
                <span className="text-xs">
                  Удалить все копии с карты ({u.plain} шт.)
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {u.custom > 0
                      ? `Донастроенные ${u.custom} останутся — у них свои настройки.`
                      : "Убираются только полные совпадения с шаблоном."}
                  </span>
                </span>
              </label>
              {!removeCopies && (
                <p className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" />
                  Без галочки все {u.total} копий останутся на карте и будут работать по своим
                  настройкам.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium"
          >
            Отмена
          </button>
          <button
            onClick={() => del.mutate()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            {del.isPending ? "Удаляю…" : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}
