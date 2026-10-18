// Админ · Турниры: плашки по разделам (черновики / идут / завершены), форма
// создания и правки черновика, запуск, остановка, таблица и очки участника.
//
// После любой мутации — invalidate своих ключей (список и таблицы): плашка
// меняет статус сразу, без F5. Пока что-то идёт, список сам обновляется раз в 30 с (участники,
// «осталось»), а часы на плашках тикают раз в 30 с.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { TourAdminRow } from "@/lib/tournament/types";
import {
  adminTourDelete,
  adminTourList,
  adminTourSave,
  adminTourStart,
  adminTourStop,
} from "@/server/api/tournament/tour-admin";
import { TourEditor } from "./TourEditor";
import { TourPlate } from "./TourPlate";
import { TourBoardModal } from "./TourBoardModal";
import { draftOfRow, emptyTourDraft, savePayload, type TourDraft } from "./tourDraft";
import { groupTours, type TourSection } from "./tourList";
import { errText } from "./tourText";
import { TourLetterButton, TourLetterGen } from "@/components/admin/letters/TourLetterGen";

const KEY = ["admin-tours"] as const;
const SECTIONS: TourSection[] = ["draft", "running", "done"];
type Op = { op: "start" | "stop" | "delete"; id: string };

// Запланированный черновик стартует сам (тикер сервера) — плашка должна
// перейти в «Идут» без F5, поэтому он тоже держит опрос.
const live = (rows: readonly TourAdminRow[] | undefined): boolean =>
  (rows ?? []).some(
    (r) => r.status === "running" || r.status === "paying" || (r.status === "draft" && !!r.startAt),
  );

export function TourAdminPage() {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TourDraft | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [letterGen, setLetterGen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);

  const listQ = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<TourAdminRow[]> => adminTourList(),
    refetchInterval: (q) => (live(q.state.data) ? 30_000 : false),
  });
  const rows = Array.isArray(listQ.data) ? listQ.data : [];
  const groups = groupTours(rows);
  const boardOf = rows.find((r) => r.id === boardId) ?? null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["admin-tour-table"] });
  };

  const save = useMutation({
    mutationFn: (d: TourDraft) => adminTourSave({ data: savePayload(d) }),
    onSuccess: () => {
      toast.success(t("tour.adm.saved_ok"));
      setDraft(null);
    },
    onError: (e: Error) => toast.error(errText(e, t)),
    onSettled: refresh,
  });

  const act = useMutation({
    mutationFn: async ({ op, id }: Op) => {
      if (op === "start") return adminTourStart({ data: { id } });
      if (op === "stop") return adminTourStop({ data: { id } });
      return adminTourDelete({ data: { id } });
    },
    onSuccess: (_r, { op }) =>
      toast.success(
        t(
          op === "start"
            ? "tour.adm.started_ok"
            : op === "stop"
              ? "tour.adm.stopped_ok"
              : "tour.adm.deleted_ok",
        ),
      ),
    onError: (e: Error) => toast.error(errText(e, t)),
    // И при отказе: «пула не хватает» оставляет черновик, а свежий статус
    // (вдруг его уже запустил другой админ) должен приехать сразу.
    onSettled: refresh,
  });
  const busyId = act.isPending ? act.variables?.id : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Trophy className="h-5 w-5" />
        </span>
        <h1 className="flex-1 font-display text-2xl font-bold">{t("tour.adm.title")}</h1>
        <TourLetterButton onClick={() => setLetterGen(true)} />
        <button
          type="button"
          onClick={() => setDraft(emptyTourDraft())}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium"
        >
          <Plus className="h-4 w-4" /> {t("tour.adm.create")}
        </button>
      </header>

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}

      {listQ.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {errText(listQ.error, t)}
        </p>
      )}

      {listQ.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("tour.adm.empty")}
        </div>
      )}

      {SECTIONS.map((s) =>
        groups[s].length === 0 ? null : (
          <section key={s} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`tour.adm.sec_${s}`)} · {groups[s].length}
            </h2>
            {groups[s].map((r) => (
              <TourPlate
                key={r.id}
                row={r}
                now={now}
                busy={busyId === r.id}
                onStart={() => act.mutate({ op: "start", id: r.id })}
                onStop={() => act.mutate({ op: "stop", id: r.id })}
                onDelete={() => act.mutate({ op: "delete", id: r.id })}
                onEdit={() => setDraft(draftOfRow(r))}
                onBoard={() => setBoardId(r.id)}
              />
            ))}
          </section>
        ),
      )}

      {draft && (
        <TourEditor
          value={draft}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          saving={save.isPending}
          onClose={() => setDraft(null)}
        />
      )}

      {boardOf && <TourBoardModal tour={boardOf} onClose={() => setBoardId(null)} />}

      {letterGen && <TourLetterGen onClose={() => setLetterGen(false)} />}
    </div>
  );
}
