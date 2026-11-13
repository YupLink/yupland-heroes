// «Очистить всё» в панели мира (владелец, 07.11.2026: «очищает полностью все
// клетки — чтобы начать делать из пустоты»). Стирание не отменить — второй тап
// подтверждает. Только автор мира и админ (сервер проверяет сам).
import { useState } from "react";
import { Eraser } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useCreatorClear } from "./useCreator";

export function CreatorClear({ mapId, disabled }: { mapId: string; disabled: boolean }) {
  const t = useT();
  const clear = useCreatorClear();
  const [asking, setAsking] = useState(false);
  const busy = disabled || clear.isPending;
  if (!asking)
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full text-destructive"
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        <Eraser aria-hidden="true" />
        {t("creator.clear")}
      </Button>
    );
  return (
    <div className="space-y-2 rounded-xl border border-destructive/50 p-2" role="alertdialog">
      <p className="text-sm">{t("creator.clear_ask")}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => clear.mutate(mapId, { onSettled: () => setAsking(false) })}
        >
          {t("creator.clear_yes")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          disabled={clear.isPending}
          onClick={() => setAsking(false)}
        >
          {t("creator.clear_no")}
        </Button>
      </div>
    </div>
  );
}
