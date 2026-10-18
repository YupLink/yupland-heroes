import { useState } from "react";
import { CollectionListView } from "@/components/chips/CollectionListView";
import { CollectionDetailView } from "@/components/chips/CollectionDetailView";
import { TemplateInstancesView } from "@/components/chips/TemplateInstancesView";

type ColView =
  | { kind: "list" }
  | { kind: "detail"; collectionId: string }
  | { kind: "template"; templateId: string; collectionId: string };

/** compactHelp — Казарма замка: вкладка без верхнего отступа (шапка своя). */
export function CollectionsTab({ compactHelp = false }: { compactHelp?: boolean } = {}) {
  const [view, setView] = useState<ColView>({ kind: "list" });
  return (
    <div className={compactHelp ? "relative" : "pt-2"}>
      {view.kind === "list" && (
        <CollectionListView onOpen={(id) => setView({ kind: "detail", collectionId: id })} />
      )}
      {view.kind === "detail" && (
        <CollectionDetailView
          collectionId={view.collectionId}
          onBack={() => setView({ kind: "list" })}
          onOpenTemplate={(tplId) =>
            setView({
              kind: "template",
              templateId: tplId,
              collectionId: view.collectionId,
            })
          }
        />
      )}
      {view.kind === "template" && (
        <TemplateInstancesView
          templateId={view.templateId}
          onBack={() => setView({ kind: "detail", collectionId: view.collectionId })}
        />
      )}
    </div>
  );
}
