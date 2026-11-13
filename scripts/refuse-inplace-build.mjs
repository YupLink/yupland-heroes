// Сборка отказывается идти поверх живой игры.
//
// На проде /opt/golden-drop/.output — ССЫЛКА на живую сборку
// (.builds/<sha>); атомарный деплой собирает в /opt/golden-drop-build, где
// .output — обычный каталог. Старый скрипт выкатки из репо портала (его
// возвращает каждая выкатка портала) собирал прямо в /opt/golden-drop —
// то есть внутрь живой сборки. 20.10.2026 такая сборка упала и оставила игру
// без файлов на 3 часа. Если .output — ссылка, сборка здесь не нужна: выходим
// с ошибкой, живая сборка цела, пуш выкатит атомарный скрипт.
import { lstatSync } from "node:fs";

let link = false;
try {
  link = lstatSync(".output").isSymbolicLink();
} catch {
  // .output ещё нет — обычная сборка
}
if (link) {
  console.error(
    "[refuse-inplace-build] .output — ссылка на живую сборку: сборка поверх игры запрещена (см. yupland-atomic-deploy).",
  );
  process.exit(1);
}
