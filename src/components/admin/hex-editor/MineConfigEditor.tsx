// Настройка шахты ЭТОЙ клетки: что добывает (ресурс + сколько за час) и цена
// захвата в энергии. Хранится плоско в building_config клетки — ту же форму
// читает SQL raid_mine_settle. Механика админ-онли, но редактор общий.
import { Pickaxe } from "lucide-react";
import type { MineConfig } from "@/lib/mineConfig";
import type { MineResource } from "@/lib/buildingEffect";
import { withoutUsdt } from "@/lib/usdtBanned";

// Подписи ресурсов — по-русски, коротко, как в остальной админке.
const RESOURCE_LABELS: Record<MineResource, string> = {
  likes: "Лайки",
  tickets: "Билеты",
  energy: "Энергия",
  gold: "Золото",
  stone: "Камень",
  diamonds: "Алмазы",
  wood: "Дерево",
  token: "Токен (NEAR-FT)",
};

// «Билеты» не предлагаются: билетов нет (§8.61), старая шахта tickets платит золотом ×100.
const RESOURCES = (Object.keys(RESOURCE_LABELS) as MineResource[]).filter((r) => r !== "tickets");

export function MineConfigEditor({
  config,
  tokens,
  onChange,
}: {
  config: MineConfig;
  /** Символы токенов — нужны, если ресурс = «токен». */
  tokens: string[];
  onChange: (next: MineConfig) => void;
}) {
  const patch = (p: Partial<MineConfig>) => onChange({ ...config, ...p });
  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-amber-300">
        <Pickaxe className="h-3 w-3" />
        Добыча ЭТОЙ шахты · применится после «Сохранить» карты
      </p>

      <label className="mb-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Что добывает
        </span>
        <select
          value={config.resource}
          onChange={(e) => {
            const resource = e.target.value as MineResource;
            patch({
              resource,
              // Токен нужен только для «token», иначе обнуляем — чтобы в конфиге
              // не болтался мусор от прежнего выбора.
              token: resource === "token" ? (config.token ?? withoutUsdt(tokens)[0] ?? null) : null,
            });
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>

      {config.resource === "token" && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Какой токен
          </span>
          <select
            value={config.token ?? ""}
            onChange={(e) => patch({ token: e.target.value || null })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">— выбери токен —</option>
            {/* USDT шахта не добывает: выход без предела (ПРАВИЛА §8.49а). */}
            {withoutUsdt(tokens).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            За час, шт.
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={config.yield || ""}
            onChange={(e) => patch({ yield: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            placeholder="сколько"
            className={`w-full rounded-lg border bg-background px-3 py-2 text-sm tabular-nums ${
              config.yield > 0 ? "border-border" : "border-destructive"
            }`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Захват, энергия
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={config.captureCost || ""}
            onChange={(e) =>
              patch({ captureCost: Math.max(0, Math.round(Number(e.target.value) || 0)) })
            }
            placeholder="0"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
      </div>

      <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
        Захвативший добывает раз в час и собирает в любой момент. Перехват другим
        обнуляет секундомер новому владельцу.
      </p>
      {config.yield <= 0 && (
        <p className="mt-1 text-[10px] font-semibold leading-tight text-destructive">
          Укажи добычу за час — без неё шахту нельзя захватить.
        </p>
      )}
      {config.captureCost > 0 && (
        <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
          Цена захвата — {config.captureCost} энергии. Игрок не захватит, если его
          максимум энергии меньше.
        </p>
      )}
    </div>
  );
}
