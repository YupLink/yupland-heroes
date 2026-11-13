// Шаблоны городов: список и действия над ним (сохранить, вкл/выкл, удалить).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteTownTemplate,
  listTownTemplates,
  saveTownTemplate,
  setTownTemplateActive,
} from "@/server/api/beta-raid/island/town-template-api";
import { templateError, type TownTemplateText } from "./townTemplateText";

const KEY = ["town-templates"];
const listQuery = { queryKey: KEY, queryFn: () => listTownTemplates(), staleTime: 30_000 };

/** Городские постройки — палитра дизайнера; не дизайнер — null (все). */
export function useTownBuildingIds(enabled: boolean): ReadonlySet<string> | null {
  const q = useQuery({ ...listQuery, enabled });
  const town = q.data?.town;
  return useMemo(() => (enabled ? new Set(town ?? []) : null), [enabled, town]);
}

export function useTownTemplates(t: TownTemplateText) {
  const qc = useQueryClient();
  const list = useQuery(listQuery);
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  const fail = (e: unknown) => toast.error(templateError(t, e));

  const save = useMutation({
    mutationFn: (d: { name: string; q: number; r: number }) => saveTownTemplate({ data: d }),
    onSuccess: (res) => {
      toast.success(t.saved(res.buildings));
      return done();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (d: { id: string; active: boolean }) => setTownTemplateActive({ data: d }),
    onSuccess: done,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTownTemplate({ data: { id } }),
    onSuccess: done,
    onError: fail,
  });

  return { templates: list.data?.templates ?? [], save, toggle, remove };
}
