// Тест острова (кнопка в правом меню карты, isIslandTester — админы и дизайнер): на свой
// остров, назад, новый остров с нуля, обучение с нуля (с подтверждением). Новичкам кнопки нет.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TreePalm } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HudRoundButton } from "../HudRoundButton";
import {
  adminIslandEnter,
  adminIslandLeave,
  adminIslandReset,
  adminIslandTutorialRestart,
} from "@/server/api/beta-raid/island/island-api";
import { serverErrorText } from "@/lib/serverErrorText";
import { invalidateHeroQueries } from "@/lib/query";
import { useLang, useT } from "@/lib/i18n";
import { useIsland, useIslandRefresh } from "./useIsland";
import "./island.css";

type Act = "enter" | "leave" | "reset" | "restart";
const CALL: Record<Act, () => Promise<unknown>> = {
  enter: () => adminIslandEnter(),
  leave: () => adminIslandLeave(),
  reset: () => adminIslandReset(),
  restart: () => adminIslandTutorialRestart(),
};

export function IslandAdminButton() {
  const t = useT();
  const ru = useLang() === "ru";
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const refresh = useIslandRefresh();
  const onIsland = !!useIsland(true, false).data?.island?.onIsland;
  const run = useMutation({
    mutationFn: (act: Act) => CALL[act](),
    onSuccess: () => {
      refresh();
      // Окно выбора героя и герои: после сброса обучения (и нового острова) выбор снова.
      void qc.invalidateQueries({ queryKey: ["island-hero-pick"] });
      invalidateHeroQueries(qc);
      close();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const busy = run.isPending;
  const close = () => {
    setConfirm(false);
    setOpen(false);
  };
  return (
    <>
      <HudRoundButton
        icon={<TreePalm className="h-5 w-5" />}
        tone="camp"
        label={t("island.admin")}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Dialog open onOpenChange={(v) => !v && !busy && close()}>
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
              {confirm ? (
                <>
                  <p className="island-dialog__note">{t("island.admin_restart_confirm")}</p>
                  <button
                    type="button"
                    className="island-dialog__go"
                    disabled={busy}
                    onClick={() => run.mutate("restart")}
                  >
                    {t("island.admin_restart_go")}
                  </button>
                  <button
                    type="button"
                    className="island-dialog__alt"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="island-dialog__alt"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  {t("island.admin_restart")}
                </button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
