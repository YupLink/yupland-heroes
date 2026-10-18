import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listChipCollectionsPublic, getMyCollectionFarms } from "@/server/api/chips-stake";
import { CollectionCard } from "@/components/chips/CollectionCard";

function CollectionListView({ onOpen }: { onOpen: (collectionId: string) => void }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["chip-collections-public"],
    queryFn: () => listChipCollectionsPublic(),
  });
  const farms = useQuery({
    queryKey: ["my-collection-farms"],
    queryFn: () => getMyCollectionFarms(),
    refetchInterval: 60_000,
  });
  const [idleOpen, setIdleOpen] = useState(false);
  useEffect(() => {
    try {
      setIdleOpen(localStorage.getItem("chips-idle-open") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleIdle = (open: boolean) => {
    setIdleOpen(open);
    try {
      localStorage.setItem("chips-idle-open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
        {t("chips.no_active_collections")}{" "}
        <Link to="/admin/chips" className="text-gold underline">
          /admin/chips
        </Link>
        .
      </div>
    );
  }
  const farmsById = new Map((farms.data ?? []).map((f) => [f.collectionId, f]));
  const isFarming = (c: (typeof rows)[number]) => {
    const f = farmsById.get(c.id);
    return !!f && f.ratePerDay > 0;
  };
  const farming = rows.filter(isFarming);
  const idle = rows.filter((c) => !isFarming(c));
  return (
    <div className="space-y-2">
      {farming.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest text-gold">
            {t("chips.farming_collections", { n: farming.length })}
          </div>
          {farming.map((c) => (
            <CollectionCard
              key={c.id}
              collection={c}
              farm={farmsById.get(c.id) ?? null}
              onOpen={() => onOpen(c.id)}
            />
          ))}
        </>
      )}
      {idle.length > 0 && (
        <details
          className="group rounded-2xl border border-border/60 bg-card/40"
          open={idleOpen}
          onToggle={(e) => toggleIdle((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{t("chips.idle_collections", { n: idle.length })}</span>
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 p-2 pt-0">
            {idleOpen && idle.map((c) => (
              <CollectionCard
                key={c.id}
                collection={c}
                farm={farmsById.get(c.id) ?? null}
                onOpen={() => onOpen(c.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export { CollectionListView };

