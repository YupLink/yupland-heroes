// Настройка столба заклинаний в режиме бога: цены и список — прямо на живой
// карте.
//
// Тот же редактор, что у портала и алтаря, и по той же причине: правило одно,
// форма одна. Черновик держим до первого касания — поздний ответ сервера иначе
// затирал бы уже введённое.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { SpellbookConfigEditor } from "@/components/admin/hex-editor/SpellbookConfigEditor";
import { spellbookConfigDraft, type SpellbookCellConfig } from "@/lib/spellbookConfig";

export function AdminSpellbookEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<SpellbookCellConfig | null>(null);
  const value = draft ?? spellbookConfigDraft(config);

  return (
    <SpellbookConfigEditor
      config={value}
      tokens={tokens}
      onChange={(next) => {
        setDraft(next);
        // Соседние ключи конфига клетки не трогаем — они живут рядом.
        onSave({ ...(config ?? {}), spellbook: next });
      }}
    />
  );
}
