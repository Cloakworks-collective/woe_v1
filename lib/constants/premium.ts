// Premium — the Royal Charter (spec/clans.md). Gameplay caps live in
// balance.ts; the MONETIZATION values (price, product copy) stay here — they
// are business decisions, not game balance.

/** Price per age, USD cents (Stripe Checkout). The Charter lasts until the
 *  era turns — every empire begins the new age uncharted. */
export const CHARTER_PRICE_CENTS = 899;
export const CHARTER_PRODUCT_NAME = "War of Empires — The Royal Charter (one age)";
export const CHARTER_PRODUCT_DESC =
  "Unlocks the Steward for the current age: build & research queues, standing orders, and auto-banking.";

export { STEWARD_QUEUE_CAP, WORK_QUEUE_CAP } from "./balance";
