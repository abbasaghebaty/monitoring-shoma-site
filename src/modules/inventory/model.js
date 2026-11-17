// Inventory is a ledger, not just an editable stock number.
// Every stock change should have a source document and an auditable movement.
export const STOCK_MOVEMENT_TYPES = ["purchase", "sale", "return_in", "return_out", "adjustment", "opening_balance"];
