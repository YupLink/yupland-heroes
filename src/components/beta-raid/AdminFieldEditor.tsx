// Настройка грядки в режиме бога: что растёт и кого пускают — на живой карте.
//
// Пишет конфиг ключом `field` в building_config клетки через общую очередь
// правок (как надпись таблички и шахта). Черновик держим до первого касания:
// поздний ответ сервера иначе затирал бы уже введённое.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { FieldConfigEditor } from "@/components/admin/hex-editor/FieldConfigEditor";
import { fieldConfigDraft, type FieldConfig } from "@/lib/fieldConfig";

export function AdminFieldEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<FieldConfig | null>(null);
  const value = draft ?? fieldConfigDraft(config);

  return (
    <FieldConfigEditor
      config={value}
      tokens={tokens}
      onChange={(next) => {
        setDraft(next);
        onSave({ field: next });
      }}
    />
  );
}
