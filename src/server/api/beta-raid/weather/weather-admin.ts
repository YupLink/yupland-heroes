import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";

// This setting is sampled by raid_weather_ensure when a NEW slot is created.
// Never rewrite existing slots or clear their caches here.
export const adminGetWeatherEffects = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.settings
       WHERE key = 'weather_effects' AND btrim(value, ' "') = 'on') AS enabled`,
    { wrapJson: true },
  )) as Array<{ enabled: boolean }> | null;
  if (typeof rows?.[0]?.enabled !== "boolean")
    throw new Error("Не удалось прочитать настройку погоды");
  return { enabled: rows[0].enabled };
});

export const adminSetWeatherEffects = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).strict().parse(data))
  .handler(async ({ data }) => {
    requireAdmin();
    // Fixed key, boolean input, fixed SQL values. No arbitrary settings access.
    const value = data.enabled ? "on" : "off";
    const rows = (await mcpExec(
      `INSERT INTO yuplink.settings (key, value) VALUES ('weather_effects', '${value}')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value RETURNING value`,
      { wrapJsonCte: true },
    )) as Array<{ value: string }> | null;
    if (rows?.[0]?.value !== value) throw new Error("Не удалось сохранить настройку погоды");
    return { enabled: data.enabled };
  });
