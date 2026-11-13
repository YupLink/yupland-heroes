// Постановка точек шаблоном (режим бога): выбран шаблон — тап по клетке ставит
// точку спавна из него (adminStampSpawnPoint); где точка уже есть — отказ.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { adminStampSpawnPoint } from "@/server/api/beta-raid/spawn-point/spawn-template-api";
import { SPAWN_POINTS_KEY } from "./useSpawnMarks";

export function useSpawnStamp() {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const [template, setTemplate] = useState<string | null>(null);
  const tap = (q: number, r: number) => {
    if (!template) return;
    void adminStampSpawnPoint({ data: { q, r, template } })
      .then((res) => {
        toast.success(
          res.placed < res.wanted
            ? en
              ? `Point ${q}, ${r}: room for ${res.placed} of ${res.wanted}`
              : `Точка ${q}, ${r}: мест хватило на ${res.placed} из ${res.wanted}`
            : en
              ? `Point ${q}, ${r} placed`
              : `Точка ${q}, ${r} поставлена`,
          { id: "spawn-stamp" },
        );
        void qc.invalidateQueries({ queryKey: SPAWN_POINTS_KEY });
        void qc.invalidateQueries({ queryKey: ["admin-spawn-point", q, r] });
        void qc.invalidateQueries({ queryKey: ["admin-mob-spawn"] });
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : String(e), { id: "spawn-stamp" }),
      );
  };
  return { template, setTemplate, tap };
}
