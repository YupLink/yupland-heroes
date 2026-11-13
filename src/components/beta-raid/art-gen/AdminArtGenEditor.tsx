// Настройка «Генератора артефактов» (§8.122) в режиме бога: цена заказа на
// каждую редкость и цена «Сделать уникальным» — строками «ресурс + сколько»
// (тот же редактор, что у портала, алтаря и «Забвения»). Пустая цена редкости —
// эту редкость не заказать. Своей кнопки «Сохранить» нет: правка ложится в
// очередь выгрузки сразу; черновик держим до первого касания.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { PortalPricesEditor } from "@/components/admin/hex-editor/PortalPricesEditor";
import { ART_GEN_RESOURCES, artGenConfigDraft, type ArtGenConfig } from "@/lib/artGen/artGenConfig";
import { CRAFT_RARITIES } from "@/lib/craft/craftTable";
import { metaLabel } from "@/components/heroMeta";

export function AdminArtGenEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const lang = useLang();
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<ArtGenConfig | null>(null);
  const value = draft ?? artGenConfigDraft(config);
  const put = (next: ArtGenConfig) => {
    setDraft(next);
    // Соседние ключи конфига клетки не трогаем — они живут рядом.
    onSave({ ...(config ?? {}), artGen: next });
  };

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3">
      <p className="flex items-center justify-center gap-1 text-center text-[11px] text-gold">
        <Sparkles className="h-3 w-3" />
        Генератор артефактов ЭТОЙ клетки
      </p>
      {CRAFT_RARITIES.map((r) => (
        <PortalPricesEditor
          key={r}
          prices={value.prices[r]}
          tokens={tokens}
          resources={[...ART_GEN_RESOURCES]}
          onChange={(list) => put({ ...value, prices: { ...value.prices, [r]: list } })}
          title={`Цена: ${metaLabel(r, lang)}`}
          emptyText="Не задана — эту редкость не заказать."
        />
      ))}
      <PortalPricesEditor
        prices={value.unique}
        tokens={tokens}
        resources={[...ART_GEN_RESOURCES]}
        onChange={(unique) => put({ ...value, unique })}
        title="Цена уникальности"
        emptyText="Не задана — сделать арт уникальным нельзя."
      />
    </div>
  );
}
