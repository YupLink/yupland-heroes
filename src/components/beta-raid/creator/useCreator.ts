// Запросы «Шаблонов поселений» (server/api/creator/creator-api): доступ, работы,
// другие креаторы; переходы в работу и из неё — сразу карта с героем
// (requestCenter закрывает профиль и открывает мир), как у демо-острова.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import { useIslandRefresh } from "@/components/beta-raid/island/useIsland";
import { useAppStore } from "@/lib/store";
import { invalidateRaidMap } from "@/lib/query";
import { flushCreatorEdits } from "./useCreatorAutosave";
import { tFor } from "@/lib/i18n";
import { canEditWork } from "@/lib/raid/creator/ids";
import { addCreator, listCreatorTeam } from "@/server/api/creator/creator-team-api";
import {
  clearCreatorWork,
  copyCreatorWork,
  createCreatorWork,
  expandCreatorWork,
  enterCreatorWorld,
  getCreatorAccess,
  leaveCreatorWork,
  listCreatorPeers,
  listCreatorWorks,
  openCreatorWork,
  renameCreatorWork,
  shareCreatorWork,
} from "@/server/api/creator/creator-api";

export const CREATOR_ACCESS_KEY = ["creator-access"] as const;
export const CREATOR_WORKS_KEY = ["creator-works"] as const;
const PEERS_KEY = ["creator-peers"] as const;
export const CREATOR_TEAM_KEY = ["creator-team"] as const;

type Move = { map: string; at: { q: number; r: number } } | null;

export function useCreatorAccess(enabled = true) {
  return useQuery({
    queryKey: CREATOR_ACCESS_KEY,
    queryFn: () => getCreatorAccess(),
    staleTime: 0,
    enabled,
  });
}

export function useCreatorWorks(enabled: boolean) {
  return useQuery({ queryKey: CREATOR_WORKS_KEY, queryFn: () => listCreatorWorks(), enabled });
}

export function useCreatorPeers(enabled: boolean) {
  return useQuery({
    queryKey: PEERS_KEY,
    queryFn: () => listCreatorPeers(),
    enabled,
    staleTime: 60_000,
  });
}

export type CreatorMoveArg =
  | { kind: "enter" }
  | { kind: "create"; name: string }
  | { kind: "open"; mapId: string }
  | { kind: "copy"; mapId: string }
  | { kind: "leave" };

/** Переход: войти, создать, открыть, выйти — после него карта с героем. */
export function useCreatorMove() {
  const qc = useQueryClient();
  const refresh = useIslandRefresh();
  const lang = useAppStore((s) => s.lang);
  return useMutation({
    mutationFn: async (a: CreatorMoveArg): Promise<Move> => {
      // Сначала несохранённые мазки — на сервер: после перехода черновик чужой
      // карты выбрасывается (владелец: «при переходе творчество слетело»).
      if (!(await flushCreatorEdits())) throw new Error("creator.save_failed");
      if (a.kind === "enter")
        return enterCreatorWorld({ data: { lang: lang === "en" ? "en" : "ru" } });
      if (a.kind === "create") return createCreatorWork({ data: { name: a.name } });
      if (a.kind === "open") return openCreatorWork({ data: { mapId: a.mapId } });
      if (a.kind === "copy")
        return copyCreatorWork({ data: { mapId: a.mapId, lang: lang === "en" ? "en" : "ru" } });
      return (await leaveCreatorWork()).moved;
    },
    onSuccess: (to) => {
      refresh();
      void qc.invalidateQueries({ queryKey: CREATOR_ACCESS_KEY });
      void qc.invalidateQueries({ queryKey: CREATOR_WORKS_KEY });
      void qc.invalidateQueries({ queryKey: CREATOR_TEAM_KEY });
      if (to) requestCenter({ q: to.at.q, r: to.at.r });
    },
    onError: (e) => toast.error(humanError(e)),
  });
}

/** Правка списка без перехода: имя и общий доступ. */
export function useCreatorEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { kind: "rename"; mapId: string; name: string }
        | { kind: "share"; mapId: string; account: string; role: "view" | "edit" | null },
    ) => {
      if (a.kind === "rename") return renameCreatorWork({ data: { mapId: a.mapId, name: a.name } });
      return shareCreatorWork({ data: { mapId: a.mapId, account: a.account, role: a.role } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CREATOR_WORKS_KEY });
      void qc.invalidateQueries({ queryKey: CREATOR_TEAM_KEY });
    },
    onError: (e) => toast.error(humanError(e)),
  });
}

/** «Очистить всё»: мир пустой — карта перечитывается сразу, без F5. */
export function useCreatorClear() {
  const qc = useQueryClient();
  const lang = useAppStore((s) => s.lang);
  return useMutation({
    mutationFn: async (mapId: string) => {
      // Мазки в пути сначала ложатся, потом стираются вместе со всем — иначе
      // автосохранение вернуло бы их поверх пустого мира.
      await flushCreatorEdits();
      return clearCreatorWork({ data: { mapId } });
    },
    onSuccess: () => {
      invalidateRaidMap(qc);
      toast.success(tFor(lang === "en" ? "en" : "ru", "creator.cleared"));
    },
    onError: (e) => toast.error(humanError(e)),
  });
}

/** Можно ли править мир под героем: автор, роль «править» или админ; пока список грузится — нет. */
export function useCreatorCanEdit(mapId: string | null | undefined, admin: boolean): boolean {
  const works = useCreatorWorks(!!mapId);
  if (!mapId) return false;
  if (admin) return true;
  const here = works.data?.find((w) => w.mapId === mapId);
  return !!here && canEditWork(here, false);
}

/** Расширить рамку мира: 128, 256, 512 — карта перечитывается сразу. */
export function useCreatorExpand() {
  const qc = useQueryClient();
  const lang = useAppStore((s) => s.lang);
  return useMutation({
    mutationFn: async (a: { mapId: string; size: 128 | 256 | 512 }) => {
      await flushCreatorEdits();
      return expandCreatorWork({ data: a });
    },
    onSuccess: (r) => {
      invalidateRaidMap(qc);
      void qc.invalidateQueries({ queryKey: CREATOR_WORKS_KEY });
      toast.success(tFor(lang === "en" ? "en" : "ru", "creator.grow_done", { n: r.size }));
    },
    onError: (e) => toast.error(humanError(e)),
  });
}

/** Каталог креаторов и их миров — только админам (сервер решает). */
export function useCreatorTeam(enabled: boolean) {
  return useQuery({ queryKey: CREATOR_TEAM_KEY, queryFn: () => listCreatorTeam(), enabled });
}

/** Добавить креатора по нику Telegram. */
export function useAddCreator() {
  const qc = useQueryClient();
  const lang = useAppStore((s) => s.lang);
  return useMutation({
    mutationFn: (nick: string) => addCreator({ data: { nick } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CREATOR_TEAM_KEY });
      void qc.invalidateQueries({ queryKey: PEERS_KEY });
      toast.success(tFor(lang === "en" ? "en" : "ru", "creator.added", { name: r.name }));
    },
    onError: (e) => toast.error(humanError(e)),
  });
}
