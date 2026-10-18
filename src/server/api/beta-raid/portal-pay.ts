// Плата за проход через портал — теперь общий модуль (resource-pay).
//
// Оставлено ради читаемости вызовов у портала: сама механика одна и та же, и
// стройка платит ею же.
export { payResources as payPortal, refundResources as refundPortal } from "./resource-pay";
