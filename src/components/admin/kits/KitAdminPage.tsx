// Админ · Наборы: бокс из конструктора боксов × N за цену в $. Список плашек,
// форма создания и правки, вкл/выкл, удаление (только у набора, который ещё не
// покупали).
//
// После любой мутации — invalidate списка админки и витрины игрока: плашка и
// окно «Купить энергию» меняются сразу, без F5.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gem, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { KitAdminRow } from "@/lib/kits";
import { adminKitDelete, adminKitList, adminKitSave, adminKitSetActive } from "@/api";
import { KITS_KEY } from "@/components/kits/useKitBuy";
import { KitEditor } from "./KitEditor";
import { KitPlate } from "./KitPlate";
import { draftOfKit, emptyKitDraft, kitSavePayload, type KitDraft } from "./kitDraft";

/** Ключ новый: у строк набора новая форма (бокс и цена в $). */
const KEY = ["admin-kit-list"] as const;

type Op = { op: "toggle" | "delete"; row: KitAdminRow };

export function KitAdminPage() {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<KitDraft | null>(null);

  const listQ = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<KitAdminRow[]> => adminKitList(),
  });
  const rows = Array.isArray(listQ.data) ? listQ.data : [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: [...KITS_KEY], refetchType: "all" });
  };

  const save = useMutation({
    mutationFn: (d: KitDraft) => adminKitSave({ data: kitSavePayload(d) }),
    onSuccess: () => {
      toast.success(t("kits.adm_saved"));
      setDraft(null);
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: refresh,
  });

  const act = useMutation({
    mutationFn: async ({ op, row }: Op) =>
      op === "toggle"
        ? adminKitSetActive({ data: { id: row.id, active: !row.active } })
        : adminKitDelete({ data: { id: row.id } }),
    onSuccess: (_r, { op }) => {
      if (op === "delete") toast.success(t("kits.adm_deleted"));
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: refresh,
  });
  const busyId = act.isPending ? act.variables?.row.id : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Gem className="h-5 w-5" />
        </span>
        <h1 className="flex-1 font-display text-2xl font-bold">{t("kits.adm_title")}</h1>
        <button
          type="button"
          onClick={() => setDraft(emptyKitDraft())}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium"
        >
          <Plus className="h-4 w-4" /> {t("kits.adm_create")}
        </button>
      </header>

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}

      {listQ.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {humanError(listQ.error)}
        </p>
      )}

      {listQ.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("kits.adm_empty")}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <KitPlate
            key={r.id}
            row={r}
            busy={busyId === r.id}
            onToggle={() => act.mutate({ op: "toggle", row: r })}
            onEdit={() => setDraft(draftOfKit(r))}
            onDelete={() => act.mutate({ op: "delete", row: r })}
          />
        ))}
      </div>

      {draft && (
        <KitEditor
          value={draft}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          saving={save.isPending}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
