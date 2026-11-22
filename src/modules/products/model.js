// Product fields intentionally mirror the confirmed D1 schema.
// Barcode, category, active status and min_stock do not exist in the live schema.
export const PRODUCT_FIELDS = [
  "product_id", "name", "unit", "package_quantity", "weight", "weight_unit",
  "description", "purchase_price", "sell_price", "consumer_price", "market_price",
];

export function validateProductDraft(draft, { creating = false } = {}) {
  const errors = {};
  const allowed = new Set(PRODUCT_FIELDS);
  for (const key of Object.keys(draft || {})) {
    if (!allowed.has(key)) errors[key] = "این فیلد در ساختار فعلی کالا پشتیبانی نمی‌شود.";
  }
  if (creating) {
    const id = String(draft?.product_id ?? "").trim();
    if (!id) errors.product_id = "شناسه کالا الزامی است.";
    else if (id.length > 80 || /[\/\\\u0000-\u001f]/.test(id)) errors.product_id = "شناسه کالا معتبر نیست.";
  } else if (Object.prototype.hasOwnProperty.call(draft || {}, "product_id")) {
    errors.product_id = "شناسه اصلی کالا قابل تغییر نیست.";
  }
  if (creating || Object.prototype.hasOwnProperty.call(draft || {}, "name")) {
    const name = String(draft?.name ?? "").trim();
    if (!name) errors.name = "نام کالا الزامی است.";
    else if (name.length > 160) errors.name = "نام کالا بیش از حد طولانی است.";
  }
  for (const [field, max] of [["unit",30],["weight_unit",20],["description",2000]]) {
    if (!Object.prototype.hasOwnProperty.call(draft || {}, field)) continue;
    const value = draft[field] == null ? "" : String(draft[field]).trim();
    if (field === "unit" && !value) errors.unit = "واحد کالا نمی‌تواند خالی باشد.";
    if (value.length > max) errors[field] = "طول مقدار واردشده بیش از حد مجاز است.";
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, "package_quantity")) {
    const value = draft.package_quantity;
    if (value !== null && value !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) errors.package_quantity = "تعداد در بسته باید عدد صحیح مثبت یا خالی باشد.";
  }
  if (Object.prototype.hasOwnProperty.call(draft || {}, "weight")) {
    const value = draft.weight;
    if (value !== null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) errors.weight = "وزن باید عدد مثبت یا خالی باشد.";
  }
  for (const field of ["purchase_price","sell_price","consumer_price","market_price"]) {
    if (!Object.prototype.hasOwnProperty.call(draft || {}, field)) continue;
    const value = draft[field];
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) errors[field] = "قیمت باید عدد صحیح و غیرمنفی باشد.";
  }
  if (!creating && Object.keys(draft || {}).filter((key) => allowed.has(key)).length === 0) errors._form = "هیچ تغییری برای ذخیره ارسال نشده است.";
  return errors;
}
