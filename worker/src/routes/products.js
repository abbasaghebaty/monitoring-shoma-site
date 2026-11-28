import { json } from "../utils/response.js";
import { canManage } from "../auth/permissions.js";
import { createProduct, updateProduct, ProductNoChangesError, ProductConflictError } from "../repositories/products.js";
import { validateProductDraft } from "../validation/products.js";
import { logEvent, logFailure } from "../utils/diagnostics.js";
function failure(status,errorCode,message,extra={}){return json({ok:false,error:{errorCode,message,...extra}},status);}
async function readJson(request){try{const b=await request.json();return b&&typeof b==="object"&&!Array.isArray(b)?b:null;}catch{return null;}}
function auditContext(user,context){return {actorTelegramId:Number(user?.telegram_id),requestId:context?.requestId||crypto.randomUUID()};}
export async function productWriteRoutes(request,env,url,user,context=null){
 const collection=url.pathname==="/api/v1/products",match=url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
 if((!collection&&!match)||request.method==="GET")return null;
 if(!canManage(user?.role,"products"))return failure(403,"FORBIDDEN","برای مدیریت کالاها مجوز کافی ندارید.");
 if(collection&&request.method==="POST"){
  const body=await readJson(request);if(!body)return failure(400,"VALIDATION_001","بدنه درخواست معتبر نیست.");
  const errors=validateProductDraft(body,{creating:true});if(Object.keys(errors).length)return failure(400,"VALIDATION_001","اطلاعات کالا معتبر نیست.",{fields:errors});
  try{const product=await createProduct(env.DB,body,auditContext(user,context));logEvent(context,"info","PRODUCT_CREATED",{outcome:"success",productId:product?.product_id});return json({ok:true,data:{product}},201);}
  catch(error){const duplicate=/UNIQUE constraint failed: products\\.product_id/i.test(String(error?.message||""));if(!duplicate)logFailure(context,{errorCode:"PRODUCT_001",stage:"product_create",error,dependency:"D1"});return failure(duplicate?409:500,duplicate?"PRODUCT_002":"PRODUCT_001",duplicate?"شناسه این کالا قبلاً ثبت شده است.":"ذخیره کالا انجام نشد.");}
 }
 if(match&&request.method==="PATCH"){
  let id;try{id=decodeURIComponent(match[1]);}catch{return failure(400,"VALIDATION_001","شناسه کالا معتبر نیست.");}
  const body=await readJson(request);if(!body)return failure(400,"VALIDATION_001","بدنه درخواست معتبر نیست.");
  const errors=validateProductDraft(body);if(Object.keys(errors).length)return failure(400,"VALIDATION_001","اطلاعات کالا معتبر نیست.",{fields:errors});
  try{const product=await updateProduct(env.DB,id,body,auditContext(user,context));if(!product)return failure(404,"PRODUCT_003","کالای موردنظر پیدا نشد.");logEvent(context,"info","PRODUCT_UPDATED",{outcome:"success",productId:id});return json({ok:true,data:{product}});}
  catch(error){if(error instanceof ProductNoChangesError)return failure(422,"PRODUCT_NO_CHANGES","مقدار جدیدی برای ذخیره وجود ندارد.");if(error instanceof ProductConflictError)return failure(409,"PRODUCT_CONFLICT","این کالا هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی و دوباره تلاش کنید.");logFailure(context,{errorCode:"PRODUCT_001",stage:"product_update",error,dependency:"D1"});return failure(500,"PRODUCT_001","به‌روزرسانی کالا انجام نشد.");}
 }
 return failure(405,"METHOD_NOT_ALLOWED","روش درخواست برای این مسیر پشتیبانی نمی‌شود.");
}
