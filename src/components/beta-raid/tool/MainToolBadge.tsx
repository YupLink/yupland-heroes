import { useLang } from "@/lib/i18n";
import { useMainTool } from "./useMainTool";
import { MainHandControl } from "./MainHandControl";

/** Persistent main-hand slot; selection uses the existing backpack mutation. */
export function MainToolBadge() {
  const ru = useLang() === "ru";
  const tool = useMainTool();
  return <MainHandControl ru={ru} main={tool.main} stacks={tool.stacks}
    loading={tool.loading} failed={tool.failed} busy={tool.busy}
    onRetry={tool.retry} onTake={tool.takeAsync} />;
}
