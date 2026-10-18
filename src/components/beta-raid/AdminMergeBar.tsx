// Полоска режима «Объединить» в режиме бога — та же MergeBar, что у замка,
// с подписями на языке игрока и очередью правок кисти.
import { useLang } from "@/lib/i18n";
import { MergeBar } from "@/components/castle-editor/MergeBar";
import { mergeText } from "./adminMergeText";
import type { useAdminMerge } from "./useAdminMerge";

export function AdminMergeBar({ merge }: { merge: ReturnType<typeof useAdminMerge> }) {
  const t = mergeText(useLang());
  return (
    <div className="mx-2 rounded-2xl border border-violet-400/40 bg-card px-1 py-0.5">
      <MergeBar
        selectedCount={merge.selected.size}
        onMerge={() => void merge.merge()}
        group={merge.block}
        onScale={merge.scale}
        onUnmerge={merge.unmerge}
        labels={{
          pickHint: t.pickHint,
          mergeBtn: t.mergeBtn,
          blockHint: t.blockHint,
          block: t.block,
          cellsShort: t.cellsShort,
          smaller: t.smaller,
          bigger: t.bigger,
          unmerge: t.unmerge,
        }}
      />
    </div>
  );
}
