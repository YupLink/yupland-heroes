// Строка моба в точке спавна: какой моб, сколько штук, в какую погоду, через
// сколько встаёт убитый и награда — «как у моба» (шаблон) или «своя» (та же
// форма наград, что у моба на клетке). Всё — выбором из списков.
import { X } from "lucide-react";
import { RESPAWN_MIN, minutesText } from "@/lib/raid/mobSpawn";
import { POINT_COUNT } from "@/lib/raid/spawnPoint";
import { RewardConfigEditor, toDraftCfg, DEF_CFG } from "@/components/admin/RewardConfigEditor";
import type { RewardConfig } from "@/components/admin/reward/rewardDraft";
import { WeatherPick } from "@/components/beta-raid/WeatherPick";
import type { MobDraft } from "./spawnPointDraft";

export type MobOption = { id: string; name: string; rewardConfig: RewardConfig | null };

const field = "rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";

export function SpawnPointMobRow({
  d,
  mobs,
  tokens,
  en,
  onChange,
  onRemove,
}: {
  d: MobDraft;
  mobs: MobOption[];
  tokens: string[];
  en: boolean;
  onChange: (d: MobDraft) => void;
  onRemove?: () => void;
}) {
  const p = (ru: string, e: string) => (en ? e : ru);
  const set = (patch: Partial<MobDraft>) => onChange({ ...d, ...patch });
  const tpl = mobs.find((m) => m.id === d.mob) ?? null;
  // «Своя» награда начинается с той, что у моба в шаблоне: правят от неё.
  const ownReward = () =>
    set({ reward: tpl?.rewardConfig ? toDraftCfg(tpl.rewardConfig) : DEF_CFG });

  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className={`${field} min-w-0 flex-1`}
          value={d.mob}
          onChange={(e) => set({ mob: e.target.value, reward: null })}
        >
          {mobs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className={field} value={d.count} onChange={(e) => set({ count: +e.target.value })}>
          {POINT_COUNT.map((n) => (
            <option key={n} value={n}>
              ×{n}
            </option>
          ))}
        </select>
        {onRemove && (
          <button
            type="button"
            aria-label={p("убрать моба", "remove mob")}
            onClick={onRemove}
            className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-1.5">
        <select
          className={field}
          value={d.respawnMin}
          onChange={(e) => set({ respawnMin: +e.target.value })}
        >
          {RESPAWN_MIN.map((m) => (
            <option key={m} value={m}>
              {p("встаёт через", "back in")} {minutesText(m, en)}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={d.reward ? "own" : "tpl"}
          onChange={(e) => (e.target.value === "own" ? ownReward() : set({ reward: null }))}
        >
          <option value="tpl">{p("награда как у моба", "reward as the mob's")}</option>
          <option value="own">{p("своя награда", "own reward")}</option>
        </select>
      </div>
      <WeatherPick value={d.weathers} onChange={(weathers) => set({ weathers })} en={en} />
      {d.reward && (
        <RewardConfigEditor
          cfg={d.reward}
          onChange={(reward) => set({ reward })}
          tokens={tokens}
          allowTickets={false}
          chipPacksOnly
          allowExtras
          allowUsdt
        />
      )}
    </div>
  );
}
