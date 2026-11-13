# Мини-игры в окне (iframe)

## «Корона гречневого королевства» — `buckwheat/`

Код Кайлани берётся напрямую из её репозитория
https://github.com/kaylani-vibe/yupland-heroes-buckwheat-match3 (ветка `main`). Владелец 11.11.2026:
«код с того репо запитан напрямую — все изменения актуально появляются и у меня» (ПРАВИЛА §8.128).

- `buckwheat/` — её дерево как есть (кроме `.git`, `.github`, `.gitignore`). Руками здесь не правим:
  следующее обновление сотрёт. Правки игры — в её репозитории.
- Какой её коммит стоит — `buckwheat.upstream`.
- Обновление — `scripts/buckwheat-sync.mjs` в `.github/workflows/buckwheat-sync.yml`. Зовёт его Repo hygiene
  после каждого пуша в main, если её ветка сдвинулась; вручную — Actions → Buckwheat sync → Run workflow.
  Перед пушем — тесты сервера игры и сборка; не прошли — обновление не уходит, остаётся прежняя версия.
  Расписания нет: на бесплатном тарифе 2000 минут Actions в месяц, их и так едят проверки PR.
- Правила (`src/engine.mjs`) исполняет и сервер (партию ведёт он). Каждая версия правил лежит в
  `src/server/api/buckwheat/engines/<отпечаток>.mjs` (12 знаков SHA-256), номер партии несёт версию
  (`bw_….<отпечаток>`) — начатая партия доигрывается по своим правилам. Номер без версии — партии
  до 11.11 (`LEGACY_ENGINE`). `engines/index.ts` пишет скрипт.
- Деньги — слово владельца: вход 100, корона 50 (DARAI ×1000, `BW_DARAI_MULT`). Закреплены в
  `bwEngine.test.ts`: поменялись выплаты в коде Кайлани — обновление не выкатится, пока владелец не скажет.
- Сборка — `scripts/build-minigames.mjs` → `public/minigames/buckwheat` (в `npm run build` и `npm run dev`).
- Связь окна с сервером — её `src/bridge.mjs` ↔ наш `src/components/buckwheat/useBuckwheatHost.ts`;
  сервер — `src/server/api/buckwheat/`, база — `migrations/buckwheat-0*.sql`.
