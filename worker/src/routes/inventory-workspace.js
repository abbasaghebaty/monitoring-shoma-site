import { json } from "../utils/response.js";
import { canManage } from "../auth/permissions.js";
import {
  createInventoryEntity,
  getInventoryEntity,
  listInventoryEntity,
  updateInventoryEntity,
} from "../repositories/inventory-workspace.js";

function failure(status, errorCode, message) {
  return json({ ok: false, error: { errorCode, message } }, status);
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function inventoryWorkspaceRoutes(request, env, url, user, context = null) {
  const match = url.pathname.match(/^\/api\/v1\/inventory-workspace\/([a-z-]+)(?:\/([^/]+))?$/);
  if (!match) return null;

  const [, key, rawId] = match;
  if (!getInventoryEntity(key)) return failure(404, "NOT_FOUND", "بخش موردنظر پیدا نشد.");
  if (!canManage(user?.role)) return failure(403, "FORBIDDEN", "برای مدیریت اطلاعات انبار مجوز کافی ندارید.");

  if (request.method === "GET" && !rawId) {
    try {
      return json({ ok: true, data: await listInventoryEntity(env.DB, key, url) });
    } catch {
      return failure(500, "INVENTORY_WORKSPACE_READ", "دریافت اطلاعات انجام نشد.");
    }
  }

  if (!["POST", "PATCH"].includes(request.method)) {
    return failure(405, "METHOD_NOT_ALLOWED", "روش درخواست پشتیبانی نمی‌شود.");
  }
  const body = await readJson(request);
  if (!body) return failure(400, "VALIDATION_001", "بدنه درخواست معتبر نیست.");

  try {
    const requestId = context?.requestId || crypto.randomUUID();
    if (request.method === "POST" && !rawId) {
      const item = await createInventoryEntity(env.DB, key, body, user.telegram_id, requestId);
      return json({ ok: true, data: { item } }, 201);
    }
    if (request.method === "PATCH" && rawId) {
      let id;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        return failure(400, "VALIDATION_001", "شناسه معتبر نیست.");
      }
      const item = await updateInventoryEntity(env.DB, key, id, body, user.telegram_id, requestId);
      return item
        ? json({ ok: true, data: { item } })
        : failure(404, "NOT_FOUND", "رکورد پیدا نشد.");
    }
    return failure(405, "METHOD_NOT_ALLOWED", "مسیر و روش درخواست سازگار نیست.");
  } catch (error) {
    if (error?.code === "STALE_ENTITY") {
      return failure(409, "INVENTORY_WORKSPACE_CONFLICT", "رکورد هم‌زمان تغییر کرده است؛ تازه‌سازی کنید.");
    }
    const message = String(error?.message || "");
    if (message.startsWith("REQUIRED_FIELD:") || message.startsWith("INVALID_FIELD")) {
      return failure(400, "VALIDATION_001", "فیلدهای ارسالی معتبر نیستند.");
    }
    if (message === "NO_CHANGES") return failure(422, "NO_CHANGES", "تغییری برای ذخیره وجود ندارد.");
    if (message === "RELATED_RECORD_INVALID" || message === "CATEGORY_CYCLE") {
      return failure(422, "RELATED_RECORD_INVALID", "رکورد مرجع انتخاب‌شده معتبر نیست.");
    }
    if (/UNIQUE constraint failed/.test(message)) {
      return failure(409, "DUPLICATE_RECORD", "نام یا کد تکراری است.");
    }
    return failure(500, "INVENTORY_WORKSPACE_WRITE", "ذخیره اطلاعات انجام نشد.");
  }
}
