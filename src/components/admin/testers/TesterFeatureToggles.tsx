// Переключатели: какие закрытые механики открыты всей группе тестеров.
// Ресурсов и служебных вещей тут нет — только игровые механики.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminSetTesterFeature } from "@/server/api/testers-admin";
import { humanError } from "@/lib/humanError";

export function TesterFeatureToggles({
  catalog,
  features,
}: {
  catalog: Array<{ key: string; label: string }>;
  /** «true» — открыто группе тестеров, «all» — открыто всем игрокам. */
  features: Record<string, boolean | string>;
}) {
  const qc = useQueryClient();
  const setFlag = useMutation({
    mutationFn: (v: { feature: string; enabled: boolean }) => adminSetTesterFeature({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-testers"] }),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-2">
      {catalog.map((f) => {
        const value = features[f.key];
        const forAll = value === "all";
        const on = !!value;
        return (
          <button
            key={f.key}
            onClick={() => setFlag.mutate({ feature: f.key, enabled: !on })}
            disabled={setFlag.isPending}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-secondary/20 px-3 py-3 text-left transition hover:bg-secondary/40 disabled:opacity-50"
          >
            <span className="text-sm">
              {f.label}
              {/* Открыто всем — переключатель группы этого уже не отменит:
                  чтобы вернуть в закрытый тест, значение правят в настройке. */}
              {forAll && <span className="ml-1.5 text-[10px] text-gold">всем</span>}
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                on ? "bg-gold" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${
                  on ? "left-[22px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        );
      })}
      {setFlag.isPending && (
        <div className="flex justify-center py-1">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
