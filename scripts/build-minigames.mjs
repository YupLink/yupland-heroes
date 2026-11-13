// Мини-игры, встроенные окном (iframe): собираются из исходников в minigames/
// в public/minigames/ ПЕРЕД сборкой игры — так в репозитории один источник
// (код автора как есть + наши правки), а сборка попадает в .output/public.
// «Корона гречневого королевства» (Кайлани, её репозиторий напрямую) — minigames/README.md.
import { resolve } from "node:path";
import { build } from "vite";

const GAMES = ["buckwheat"];

for (const name of GAMES) {
  const root = resolve("minigames", name);
  await build({
    root,
    base: "./",
    configFile: false,
    envDir: root,
    logLevel: "warn",
    css: { postcss: {} },
    build: { outDir: resolve("public/minigames", name), emptyOutDir: true },
  });
  console.log(`[build-minigames] ${name} → public/minigames/${name}`);
}
