// Меню мира в студии: вкладка «Миры» — новый мир, этот мир (расширить, копия,
// очистить, выйти) и все мои и открытые мне миры; вкладка «Креаторы» — только
// админам (владелец и Ярослав): добавить креатора по нику, каталог «креатор →
// его миры».
import { useState } from "react";
import { Copy, LogOut, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CREATOR_NAME_MAX, cleanWorkName, defaultWorldName } from "@/lib/raid/creator/ids";
import { CreatorWorkItem } from "./CreatorWorkItem";
import { CreatorClear } from "./CreatorClear";
import { CreatorExpand } from "./CreatorExpand";
import { CreatorTeam } from "./CreatorTeam";
import { useCreatorMove, useCreatorWorks } from "./useCreator";

const TAB = "min-h-10 flex-1 rounded-lg px-2 text-xs font-semibold";

export function CreatorWorldMenu({
  mapId,
  admin,
  onDone,
}: {
  mapId: string | null;
  admin: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const works = useCreatorWorks(true);
  const move = useCreatorMove();
  const [tab, setTab] = useState<"worlds" | "team">("worlds");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // Админ получает все миры — во вкладке «Миры» только свои и открытые ему,
  // чужие — в каталоге «Креаторы».
  const list = (works.data ?? []).filter((w) => w.mine || w.role !== null);
  const here = list.find((w) => w.mapId === mapId);
  const mineOrAdmin = !!here && (here.mine || admin);
  const clean = cleanWorkName(name);
  const busy = move.isPending;
  const go = (a: Parameters<typeof move.mutate>[0]) => move.mutate(a, { onSuccess: onDone });
  return (
    <div className="space-y-2">
      {admin && (
        <div role="tablist" className="flex gap-1 rounded-xl bg-secondary/40 p-1">
          {(["worlds", "team"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn(TAB, tab === id ? "bg-gold/15 text-gold" : "text-muted-foreground")}
              onClick={() => setTab(id)}
            >
              {t(id === "worlds" ? "creator.tab_worlds" : "creator.tab_team")}
            </button>
          ))}
        </div>
      )}
      {tab === "team" && admin ? (
        <CreatorTeam
          currentMapId={mapId}
          busy={busy}
          onOpen={(id) => go({ kind: "open", mapId: id })}
          onCopy={(id) => go({ kind: "copy", mapId: id })}
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              aria-pressed={naming}
              disabled={busy}
              onClick={() => {
                const own = list.filter((w) => w.mine).length;
                setName(defaultWorldName(own, lang === "en" ? "en" : "ru"));
                setNaming(!naming);
              }}
            >
              <Plus aria-hidden="true" />
              {t("creator.new")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => go({ kind: "leave" })}
            >
              <LogOut aria-hidden="true" />
              {t("creator.exit")}
            </Button>
          </div>
          {naming && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (clean && !busy) go({ kind: "create", name: clean });
              }}
            >
              <Input
                aria-label={t("creator.name")}
                className="h-11 min-w-0 text-base"
                value={name}
                maxLength={CREATOR_NAME_MAX}
                autoComplete="off"
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" className="h-11" disabled={!clean || busy}>
                {t("creator.create")}
              </Button>
            </form>
          )}
          {here && (
            <div className="space-y-2 rounded-xl border border-border/70 p-2">
              {mineOrAdmin && <CreatorExpand mapId={here.mapId} size={here.size} />}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => go({ kind: "copy", mapId: here.mapId })}
              >
                <Copy aria-hidden="true" />
                {t("creator.copy")}
              </Button>
              {mineOrAdmin && <CreatorClear mapId={here.mapId} disabled={busy} />}
            </div>
          )}
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("creator.worlds")}
          </p>
          <ul className="divide-y divide-border/60">
            {list.map((w) => (
              <CreatorWorkItem
                key={w.mapId}
                work={w}
                admin={admin}
                busy={busy}
                current={w.mapId === mapId}
                onOpen={() => go({ kind: "open", mapId: w.mapId })}
                onCopy={() => go({ kind: "copy", mapId: w.mapId })}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
