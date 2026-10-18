-- Товар-БУСТ: свой товар может давать герою прибавку к характеристике.
-- Форма та же, что у алтаря: {"stat":"spd","min":1,"max":3}. NULL — обычный
-- товар, и о бустах покупателю ничего не пишут.
ALTER TABLE yuplink.raid_custom_item ADD COLUMN IF NOT EXISTS boost jsonb;
