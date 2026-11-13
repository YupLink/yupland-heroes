// Вторичное действие обучения: сервер хранит пропуск на аккаунт.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { skipIslandTutorial } from "@/server/api/beta-raid/island/island-api";
import { serverErrorText } from "@/lib/serverErrorText";
import { useLang, useT } from "@/lib/i18n";
import { ISLAND_KEY } from "./useIsland";
import "./island.css";

export function IslandSkipControl({ skipped }: { skipped: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const ru = useLang() === "ru";
  const t = useT();
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (skip: boolean) => skipIslandTutorial({ data: { skip } }),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ISLAND_KEY });
    },
    onError: (error: Error) => toast.error(serverErrorText(error, t)),
  });

  return (
    <>
      <button
        type="button"
        className="island-skip__link"
        disabled={change.isPending}
        onClick={() => skipped ? change.mutate(false) : setConfirm(true)}
      >
        {skipped ? (ru ? "Продолжить обучение" : "Resume tutorial") : (ru ? "Пропустить" : "Skip")}
      </button>
      <Dialog open={confirm} onOpenChange={(open) => !change.isPending && setConfirm(open)}>
        <DialogContent
          closeLabel={ru ? "Закрыть" : "Close"}
          className="island-dialog island-skip__confirm z-[280]"
          overlayClassName="z-[279]"
        >
          <DialogTitle className="island-dialog__title">
            {ru ? "Пропустить обучение?" : "Skip the tutorial?"}
          </DialogTitle>
          <DialogDescription className="island-dialog__text">
            {ru
              ? "Можно будет продолжить с этого места. Выполненные действия и достижения сохранятся; наград за пропуск нет."
              : "You can resume where you left off. Completed actions and achievements stay; skipping gives no rewards."}
          </DialogDescription>
          <div className="island-skip__actions">
            <button
              type="button"
              className="island-dialog__go"
              onClick={() => setConfirm(false)}
              disabled={change.isPending}
            >
              {ru ? "Продолжить обучение" : "Continue tutorial"}
            </button>
            <button
              type="button"
              className="island-skip__link"
              onClick={() => change.mutate(true)}
              disabled={change.isPending}
            >
              {ru ? "Пропустить" : "Skip"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
