// Шапка мира креатора и отдельные инструменты поверх карты.
import { useState } from "react";
import { ChevronDown, Copy, Eye, Footprints, Globe } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/api/user-auth";
import { Button } from "@/components/ui/button";
import { AdminLiveLayer } from "../AdminLiveLayer";
import type { useAdminLive } from "../useAdminLive";
import { CreatorFloatingPanel } from "./CreatorFloatingPanel";
import { CreatorSave } from "./CreatorSave";
import { CreatorWorldMenu } from "./CreatorWorldMenu";
import { useCreatorMove, useCreatorWorks } from "./useCreator";

type Live = ReturnType<typeof useAdminLive>;

export function CreatorStudio({ live }: { live: Live }) {
  const t = useT();
  const en = useLang() === "en";
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const admin = session.data?.isAdmin === true;
  const works = useCreatorWorks(true);
  const move = useCreatorMove();
  const [menu, setMenu] = useState(false);
  const here = works.data?.find((w) => w.mapId === live.mapId);
  const viewOnly = !!here && !live.canEdit;
  return (
    <>
      <CreatorFloatingPanel
        className="creator-dock-world"
        gripLabel={
          live.canEdit
            ? en
              ? "Move world bar with arrow keys"
              : "Переместить панель мира стрелками"
            : undefined
        }
      >
        <section
          aria-label={here?.name ?? t("creator.row")}
          className="flex max-h-[72dvh] min-w-0 flex-1 flex-col"
        >
          <header className="flex items-center gap-1.5 p-1.5">
            <button
              type="button"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left hover:bg-secondary/40"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Globe
                className="h-4 w-4 shrink-0 text-gold"
                aria-hidden="true"
              />
              <span className="min-w-0 truncate text-sm font-semibold">
                {here?.name ?? t("creator.row")}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition",
                  menu && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {viewOnly ? (
              <span className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {t("creator.view_only")}
              </span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={live.walk}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold",
                  live.walk
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-border text-muted-foreground",
                )}
                onClick={() => live.setWalk(!live.walk)}
              >
                <Footprints className="h-4 w-4" aria-hidden="true" />
                {t("creator.walk")}
              </button>
            )}
            {live.canEdit && <CreatorSave brush={live.brush} />}
          </header>
          {menu && (
            <div className="min-h-0 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
              <CreatorWorldMenu
                mapId={live.mapId}
                admin={admin}
                onDone={() => setMenu(false)}
              />
            </div>
          )}
          {!menu && viewOnly && here && (
            <div className="px-1.5 pb-1.5">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={move.isPending}
                onClick={() => move.mutate({ kind: "copy", mapId: here.mapId })}
              >
                <Copy aria-hidden="true" />
                {t("creator.copy")}
              </Button>
            </div>
          )}
        </section>
      </CreatorFloatingPanel>
      {live.on && live.canEdit && (
        <div hidden={menu}>
          <AdminLiveLayer live={live} studio />
        </div>
      )}
    </>
  );
}
