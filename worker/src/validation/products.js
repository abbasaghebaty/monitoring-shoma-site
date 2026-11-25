const TEXT_LIMITS = { name: 160, unit: 30, weight_unit: 20, description: 2000, barcode: 100 };

export function validateProductDraft(input, { creating = false } = {}) {
  const errors = {};
  const allowed = new Set(["product_id", "name", "unit", "package_quantity", "weight", "weight_unit", "description", "barcode", "category_id", "brand_id", "min_stock", "is_active", "purchase_price", "sell_price", "consumer_price", "market_price"]);
  for (const key of Object.keys(input || {})) {
    if (!allowed.has(key)) errors[key] = "این فیلد در ساختار فعلی کالا پشتیبانی نمی‌شود.";
  }
  if (creating) {
    const id = String(input?.product_id ?? "").trim();
    if (!id) errors.product_id = "شناسه کالا الزامی است.";
    else if (id.length > 80 || /[\/\\\u0000-\u001f]/.test(id)) errors.product_id = "شناسه کالا معتبر نیست.";
  } else if (Object.prototype.hasOwnProperty.call(input || {}, "product_id")) {
    errors.product_id = "شناسه اصلی کالا قابل تغییر نیست.";
  }
  if (creating || Object.prototype.hasOwnProperty.call(input || {}, "name")) {
    const name = String(input?.name ?? "").trim();
    if (!name) errors.name = "نام کالا الزامی است.";
    else if (name.length > TEXT_LIMITS.name) errors.name = "نام کالا بیش از حد طولانی است.";
  }
  for (const field of ["unit", "weight_unit", "description", "barcode"]) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) continue;
    const value = input[field] == null ? "" : String(input[field]).trim();
    if (field === "unit" && !value) errors.unit = "واحد کالا نمی‌تواند خالی باشد.";
    if (value.length > TEXT_LIMITS[field]) errors[field] = "طول مقدار واردشده بیش از حد مجاز است.";
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "package_quantity")) {
    const value = input.package_quantity;
    if (value !== null && value !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) errors.package_quantity = "تعداد در بسته باید عدد صحیح مثبت یا خالی باشد.";
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "weight")) {
    const value = input.weight;
    if (value !== null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) errors.weight = "وزن باید عدد مثبت یا خالی باشد.";
  }
  for (const field of ["category_id", "brand_id"]) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) continue;
    const value = input[field];
    if (value !== null && value !== "" && (typeof value !== "string" || value.trim().length > 80 || /[\\u0000-\\u001f]/.test(value))) errors[field] = "مقدار مرجع انتخاب‌شده معتبر نیست.";
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "min_stock")) {
    const value = input.min_stock;
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) errors.min_stock = "حداقل موجودی باید عدد صحیح و غیرمنفی باشد.";
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "is_active") && ![0, 1, false, true].includes(input.is_active)) errors.is_active = "وضعیت کالا معتبر نیست.";
  for (const field of ["purchase_price", "sell_price", "consumer_price", "market_price"]) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) continue;
    const value = input[field];
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) errors[field] = "قیمت باید عدد صحیح و غیرمنفی باشد.";
  }
  if (!creating && Object.keys(input || {}).filter((key) => allowed.has(key)).length === 0) errors._form = "هیچ تغییری برای ذخیره ارسال نشده است.";
  return errors;
}
