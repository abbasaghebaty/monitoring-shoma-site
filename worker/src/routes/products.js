import { json } from "../utils/response.js";
import { canManage } from "../auth/permissions.js";
import {
  createProduct, updateProduct,
  ProductConflictError, ProductPriceRowMissingError, ProductNoChangesError,
} from "../repositories/products.js";
import { validateProductDraft } from "../validation/products.js";
import { logEvent, logFailure } from "../utils/diagnostics.js";

function failure(status, errorCode, message, extra = {}) {
  return json({ ok: false, error: { errorCode, message, ...extra } }, status);
}
async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}
function auditContext(user, context) {
  return { actorTelegramId: Number(user.telegram_id), requestId: context?.requestId || crypto.randomUUID() };
}

export async function productWriteRoutes(request, env, url, user, context = null) {
  const isCollection = url.pathname === "/api/v1/products";
  const match = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
  const isWritePath = isCollection || Boolean(match);
  if (!isWritePath || request.method === "GET") return null;
  if (!canManage(user?.role)) return failure(403, "FORBIDDEN", "برای مدیریت کالاها مجوز کافی ندارید.");

  if (isCollection && request.method === "POST") {
    const body = await readJson(request);
    if (!body) return failure(400, "VALIDATION_001", "بدنه درخواست معتبر نیست.");
    const errors = validateProductDraft(body, { creating: true });
    if (Object.keys(errors).length) return failure(400, "VALIDATION_001", "اطلاعات کالا معتبر نیست.", { fields: errors });
    try {
      const product = await createProduct(env.DB, body, auditContext(user, context));
      logEvent(context, "info", "PRODUCT_CREATED", { outcome: "success", actorRole: user.role, productId: product?.product_id || String(body.product_id).trim() });
      return json({ ok: true, data: { product } }, 201);
    } catch (error) {
      logFailure(context, { errorCode: "PRODUCT_001", stage: "product_create", error, dependency: "D1" });
      const message = String(error?.message || "");
      if (message === "PRODUCT_CATEGORY_INVALID" || message === "PRODUCT_BRAND_INVALID") return failure(422, "PRODUCT_REFERENCE_INVALID", "دسته‌بندی یا برند انتخاب‌شده فعال نیست یا وجود ندارد.");
      const duplicate = /UNIQUE constraint failed|PRIMARY KEY/i.test(message);
      return failure(duplicate ? 409 : 500, duplicate ? "PRODUCT_002" : "PRODUCT_001",
        duplicate ? "شناسه یا بارکد این کالا قبلاً ثبت شده است." : "ذخیره کالا انجام نشد. کد پیگیری را به مدیر سامانه اعلام کنید.");
    }
  }

  if (match && request.method === "PATCH") {
    let productId;
    try { productId = decodeURIComponent(match[1]); }
    catch { return failure(400, "VALIDATION_001", "شناسه کالا معتبر نیست."); }
    const body = await readJson(request);
    if (!body) return failure(400, "VALIDATION_001", "بدنه درخواست معتبر نیست.");
    const errors = validateProductDraft(body);
    if (Object.keys(errors).length) return failure(400, "VALIDATION_001", "اطلاعات کالا معتبر نیست.", { fields: errors });
    try {
      const product = await updateProduct(env.DB, productId, body, auditContext(user, context));
      if (!product) return failure(404, "PRODUCT_003", "کالای موردنظر پیدا نشد.");
      logEvent(context, "info", "PRODUCT_UPDATED", { outcome: "success", actorRole: user.role, productId });
      return json({ ok: true, data: { product } });
    } catch (error) {
      if (error instanceof ProductConflictError) return failure(409, "PRODUCT_CONFLICT", "اطلاعات کالا هم‌زمان تغییر کرده است. صفحه را تازه‌سازی و دوباره تلاش کنید.");
      if (error instanceof ProductPriceRowMissingError) return failure(409, "PRODUCT_PRICE_MISSING", "رکورد قیمت این کالا وجود ندارد؛ ذخیره انجام نشد.");
      if (error instanceof ProductNoChangesError) return failure(422, "PRODUCT_NO_CHANGES", "مقدار جدیدی برای ذخیره وجود ندارد.");
      if (["PRODUCT_CATEGORY_INVALID","PRODUCT_BRAND_INVALID"].includes(String(error?.message || ""))) return failure(422, "PRODUCT_REFERENCE_INVALID", "دسته‌بندی یا برند انتخاب‌شده فعال نیست یا وجود ندارد.");
      if (/UNIQUE constraint failed/.test(String(error?.message || ""))) return failure(409, "PRODUCT_002", "شناسه یا بارکد این کالا قبلاً ثبت شده است.");
      logFailure(context, { errorCode: "PRODUCT_001", stage: "product_update", error, dependency: "D1" });
      return failure(500, "PRODUCT_001", "به‌روزرسانی کالا انجام نشد. کد پیگیری را به مدیر سامانه اعلام کنید.");
    }
  }
  return failure(405, "METHOD_NOT_ALLOWED", "روش درخواست برای این مسیر پشتیبانی نمی‌شود.");
}
