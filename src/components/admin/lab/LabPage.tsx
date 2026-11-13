// Админ · Лаборатория (§8.81, пока только админам): артефакт по словам или
// рандомом; бросок и картинка (бесплатные генераторы, пиксель-арт без фона) —
// на сервере. Готовый артефакт сразу в инвентаре создателя; в случайные выдачи
// он не попадает.
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { LabForm } from "./LabForm";
import { LabJobCard } from "./LabJobCard";
import { useLab } from "./useLab";

export function LabPage() {
  const t = useT();
  const { state, craft, retry } = useLab();

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6 pb-24">
      <h1 className="font-display text-2xl font-bold">{t("lab.title")}</h1>

      <LabForm onCraft={(d) => craft.mutate(d)} busy={craft.isPending} />

      {state.isPending && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}
      {state.isError && <p className="text-sm text-destructive">{humanError(state.error)}</p>}

      <div className="space-y-2">
        {state.data?.jobs.map((job) => (
          <LabJobCard
            key={job.id}
            job={job}
            retrying={retry.isPending && retry.variables === job.id}
            onRetry={() => retry.mutate(job.id)}
          />
        ))}
      </div>
    </div>
  );
}
