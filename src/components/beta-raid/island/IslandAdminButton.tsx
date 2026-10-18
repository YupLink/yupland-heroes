// Тест острова админом (кнопка в правом меню карты, только isAdmin): на свой
// остров, назад, новый остров с нуля. Новичкам кнопки нет.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TreePalm } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HudRoundButton } from "../HudRoundButton";
import {
  adminIslandEnter,
  adminIslandLeave,
  adminIslandReset,
} from "@/server/api/beta-raid/island/island-api";
import { serverErrorText } from "@/lib/serverErrorText";
import { useLang, useT } from "@/lib/i18n";
import { useIsland, useIslandRefresh } from "./useIsland";
import "./island.css";

type Act = "enter" | "leave" | "reset";
const CALL: Record<Act, () => Promise<unknown>> = {
  enter: () => adminIslandEnter(),
  leave: () => adminIslandLeave(),
  reset: () => adminIslandReset(),
};

export function IslandAdminButton() {
  const t = useT();
  const ru = useLang() === "ru";
  const [open, setOpen] = useState(false);
  const refresh = useIslandRefresh();
  const onIsland = !!useIsland(true, false).data?.island?.onIsland;
  const run = useMutation({
    mutationFn: (act: Act) => CALL[act](),
    onSuccess: () => {
      refresh();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const busy = run.isPending;
  return (
    <>
      <HudRoundButton
        icon={<TreePalm className="h-5 w-5" />}
        tone="camp"
        label={t("island.admin")}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Dialog open onOpenChange={(v) => !v && !busy && setOpen(false)}>
          <DialogContent
            closeLabel={ru ? "Закрыть" : "Close"}
            className="island-dialog z-[150]"
            overlayClassName="z-[149]"
          >
            <DialogTitle className="island-dialog__title">{t("island.admin")}</DialogTitle>
            <DialogDescription className="sr-only">{t("island.admin")}</DialogDescription>
            <div className="island-dialog__actions island-dialog__actions--column">
              {onIsland ? (
                <button
                  type="button"
                  className="island-dialog__alt"
                  disabled={busy}
                  onClick={() => run.mutate("leave")}
                >
                  {t("island.admin_leave")}
                </button>
              ) : (
                <button
                  type="button"
                  className="island-dialog__go"
                  disabled={busy}
                  onClick={() => run.mutate("enter")}
                >
                  {t("island.admin_enter")}
                </button>
              )}
              <button
                type="button"
                className="island-dialog__alt"
                disabled={busy}
                onClick={() => run.mutate("reset")}
              >
                {t("island.admin_reset")}
              </button>
              <p className="island-dialog__note">{t("island.admin_reset_confirm")}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
