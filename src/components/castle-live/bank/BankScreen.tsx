// Содержимое окна банка (пока только админ): обмен (если есть наполненный пул),
// стейкинг, лицензия на продажу золота и пулы.
import { BankExchange } from "./BankExchange";
import { BankLicenses } from "./BankLicenses";
import { BankPools } from "./BankPools";
import { BankStake } from "./BankStake";

export function BankScreen({ ru }: { ru: boolean }) {
  return (
    <>
      <BankExchange ru={ru} />
      <BankStake ru={ru} />
      <BankLicenses ru={ru} />
      <BankPools ru={ru} />
    </>
  );
}
