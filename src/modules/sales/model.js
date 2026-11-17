// Sales must be committed atomically by the Worker: sale header, line items, payments, and stock movements.
export const SALE_STATUS = ["draft", "completed", "cancelled", "returned"];
export const PAYMENT_METHODS = ["cash", "card", "transfer", "credit", "mixed"];
