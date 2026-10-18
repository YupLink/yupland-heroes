// Настройка СТОЛБА ЗАКЛИНАНИЙ на клетке: цена изучения, цена забвения и чему
// именно тут учат. Без цены забвения у столба забыть нельзя
// (server/api/beta-raid/spell-forget-pillar.ts).
//
// Цены — тем же редактором строк, что у портала и алтаря: «ресурс + сколько»,
// берутся все разом. Список заклинаний — галочки по каталогу (/admin/spells);
// ни одной галочки = столб учит всему, что сейчас в игре.
import { useQuery } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { adminListSpells } from "@/server/api/beta-raid/spell-admin";
import type { SpellTpl } from "@/server/api/beta-raid/spell-tpl";
import { spellbookConfigured, type SpellbookCellConfig } from "@/lib/spellbookConfig";
import { PortalPricesEditor } from "./PortalPricesEditor";

export function SpellbookConfigEditor({
  config,
  tokens,
  onChange,
}: {
  config: SpellbookCellConfig;
  tokens: string[];
  onChange: (next: SpellbookCellConfig) => void;
}) {
  const listQ = useQuery({ queryKey: ["admin-spells"], queryFn: () => adminListSpells() });
  const spells = (listQ.data ?? []) as SpellTpl[];
  const priced = spellbookConfigured(config);

  const toggle = (id: string) =>
    onChange({
      ...config,
      spells: config.spells.includes(id)
        ? config.spells.filter((s) => s !== id)
        : [...config.spells, id],
    });

  return (
    <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-violet-300">
        <Wand2 className="h-3 w-3" />
        Столб заклинаний ЭТОЙ клетки · применится, когда выгрузишь правки
      </p>

      <PortalPricesEditor
        prices={config.learnPrices}
        tokens={tokens}
        onChange={(learnPrices) => onChange({ ...config, learnPrices })}
        title="Цена изучения"
      />
      {!priced && (
        <p className="mb-2 text-[10px] text-destructive">
          Без цены изучения столб не работает: игроку он скажет «не настроен».
        </p>
      )}

      <PortalPricesEditor
        prices={config.forgetPrices}
        tokens={tokens}
        onChange={(forgetPrices) => onChange({ ...config, forgetPrices })}
        title="Цена забвения"
      />

      <div className="mt-1">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Чему учит
        </span>
        {listQ.isPending && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Читаем каталог…
          </p>
        )}
        {!listQ.isPending && spells.length === 0 && (
          <p className="text-[10px] text-muted-foreground">
            Каталог пуст — заведи заклинания в разделе «Заклинания».
          </p>
        )}
        {/* Своя прокрутка: каталог вырастет, а окно клетки — нет. */}
        <div className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
          {spells.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-[11px]"
            >
              <input
                type="checkbox"
                checked={config.spells.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {!s.active && <span className="shrink-0 text-[9px] text-destructive">не в игре</span>}
              <span className="shrink-0 text-[10px] text-muted-foreground">{s.energyCost} эн.</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Ничего не отмечено — столб учит всему, что сейчас в игре.
        </p>
      </div>
    </div>
  );
}
