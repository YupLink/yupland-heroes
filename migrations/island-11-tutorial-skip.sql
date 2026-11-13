-- Пропуск обучения острова (25.10.2026, пробный выпуск обучения): отметка на
-- аккаунт. Новый остров (upsert строки в island-write) и выход порталом её не
-- сбрасывают — повторно проходить не нужно; наград за пропуск нет. Накатывать
-- ДО кода (loadIsland читает колонку).
ALTER TABLE yuplink.raid_island ADD COLUMN IF NOT EXISTS tutorial_skipped_at timestamptz;
