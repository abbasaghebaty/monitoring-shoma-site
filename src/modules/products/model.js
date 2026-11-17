// Product domain contract. Align field names with the existing shop-manager D1 schema before enabling writes.
export const PRODUCT_FIELDS = ["id", "name", "barcode", "category_id", "purchase_price", "sale_price", "stock", "min_stock", "is_active"];
export const validateProductDraft = (draft) => {
  const errors = {};
  if (!String(draft.name || "").trim()) errors.name = "نام محصول الزامی است.";
  for (const field of ["purchase_price", "sale_price", "stock"]) {
    if (draft[field] !== "" && draft[field] != null && (!Number.isFinite(Number(draft[field])) || Number(draft[field]) < 0)) {
      errors[field] = "مقدار باید عددی و غیرمنفی باشد.";
    }
  }
  return errors;
};
