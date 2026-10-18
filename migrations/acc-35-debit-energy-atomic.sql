-- Списание энергии портала под условием, одним запросом.
--
-- Магазин читал остаток, сравнивал в приложении и писал абсолют. Два
-- одновременных запроса читали одно число, оба проходили проверку и
-- записывали один и тот же результат: энергия снималась один раз, а билеты
-- начислялись дважды.
CREATE OR REPLACE FUNCTION public.gd_debit_energy(p_profile uuid, p_amount numeric)
RETURNS TABLE(id uuid, energy_balance numeric)
LANGUAGE sql AS $fn$
  UPDATE public.profiles p
     SET energy_balance = p.energy_balance - p_amount
   WHERE p.id = p_profile AND p.energy_balance >= p_amount
  RETURNING p.id, p.energy_balance;
$fn$;
