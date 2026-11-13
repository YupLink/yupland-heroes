// Строка «Старт героя» в окне клетки (режим бога, только на острове): здесь
// старт — «здесь», иначе — где он сейчас и «поставить». Сервер — island-start.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { getIslandStart, setIslandStart } from "@/server/api/beta-raid/island/island-start";
import { Row, btn } from "@/components/beta-raid/AdminCellRow";

export const ISLAND_START_KEY = ["island-start"] as const;

export function AdminIslandStartRow({ q, r }: { q: number; r: number }) {
  const en = useLang() === "en";
  const p = (ru: string, e: string) => (en ? e : ru);
  const qc = useQueryClient();
  const at = useQuery({ queryKey: ISLAND_START_KEY, queryFn: () => getIslandStart() });
  const set = useMutation({
    mutationFn: () => setIslandStart({ data: { q, r } }),
    onSuccess: (res) => {
      qc.setQueryData(ISLAND_START_KEY, { canSet: true, start: res.start });
      toast.success(p("Старт героя — здесь", "Hero start is here"), { id: "island-start" });
    },
    onError: (e) => toast.error(humanError(e), { id: "island-start" }),
  });
  const start = at.data?.canSet ? at.data.start : null;
  if (!start) return null;
  const here = start.q === q && start.r === r;

  return (
    <Row label={p("Старт героя", "Hero start")}>
      {here ? (
        <span className="text-[11px] font-semibold text-gold">{p("здесь", "here")}</span>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground">
            {p("сейчас", "now")} {start.q} · {start.r}
          </span>
          <button
            type="button"
            className={btn}
            disabled={set.isPending}
            onClick={() => set.mutate()}
          >
            {p("поставить", "set")}
          </button>
        </>
      )}
    </Row>
  );
}
