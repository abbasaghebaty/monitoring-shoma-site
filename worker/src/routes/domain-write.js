import { json } from "../utils/response.js";
import { parsePagination } from "../validation/common.js";
import { canManage, canRead } from "../auth/permissions.js";
const fail=(status,code,message)=>json({ok:false,error:{code,message}},status);
async function readBody(request){try{const v=await request.json();return v&&typeof v==="object"&&!Array.isArray(v)?v:null;}catch{return null;}}
function clean(v,max){if(v==null)return null;const s=String(v).trim();return s&&s.length<=max?s:null;}
function validDate(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}
function tehranClock(){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return {date:parts.year+"-"+parts.month+"-"+parts.day,time:parts.hour+":"+parts.minute+":"+parts.second};
}
function validTime(v){return typeof v==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);}

export async function domainWriteRoutes(request,env,url,user){
 const path=url.pathname,method=request.method;
 if(path==="/api/v1/customers"&&method==="POST"){
  if(!canManage(user?.role,"customers"))return fail(403,"FORBIDDEN","برای مدیریت مشتریان مجوز کافی ندارید.");
  const b=await readBody(request);if(!b)return fail(400,"INVALID_BODY","بدنه درخواست معتبر نیست.");
  const name=clean(b.name,160),phone=clean(b.phone,40),note=clean(b.note,1000);
  if(!name||(b.phone!=null&&String(b.phone).trim()!==""&&!phone)||(b.note!=null&&String(b.note).trim()!==""&&!note))return fail(400,"VALIDATION_ERROR","اطلاعات مشتری معتبر نیست.");
  const customer=await env.DB.prepare("INSERT INTO customers(name,phone,note) VALUES(?,?,?) RETURNING id,name,phone,note,created_at").bind(name,phone,note).first();
  return json({ok:true,data:{customer}},201);
 }
 const cm=path.match(/^\/api\/v1\/customers\/(\d+)$/);
 if(cm&&method==="PATCH"){
  if(!canManage(user?.role,"customers"))return fail(403,"FORBIDDEN","برای مدیریت مشتریان مجوز کافی ندارید.");
  const b=await readBody(request);if(!b)return fail(400,"INVALID_BODY","بدنه درخواست معتبر نیست.");
  const allowed=["name","phone","note"],keys=Object.keys(b);
  if(!keys.length||keys.some(k=>!allowed.includes(k)))return fail(400,"VALIDATION_ERROR","فیلدهای ارسالی معتبر نیستند.");
  const values={};
  for(const [f,max] of [["name",160],["phone",40],["note",1000]])if(Object.hasOwn(b,f)){
   values[f]=b[f]==null||String(b[f]).trim()===""?null:clean(b[f],max);
   if((f==="name"&&!values[f])||(b[f]!=null&&String(b[f]).trim()!==""&&!values[f]))return fail(400,"VALIDATION_ERROR","اطلاعات مشتری معتبر نیست.");
  }
  const fields=Object.keys(values);
  const customer=await env.DB.prepare("UPDATE customers SET "+fields.map(f=>f+"=?").join(",")+" WHERE id=? RETURNING id,name,phone,note,created_at").bind(...fields.map(f=>values[f]),Number(cm[1])).first();
  return customer?json({ok:true,data:{customer}}):fail(404,"NOT_FOUND","مشتری پیدا نشد.");
 }
 if(path==="/api/v1/sales"&&method==="POST"){
  if(!canManage(user?.role,"sales"))return fail(403,"FORBIDDEN","برای ثبت فروش مجوز کافی ندارید.");
  const b=await readBody(request);if(!b)return fail(400,"INVALID_BODY","بدنه درخواست معتبر نیست.");
  const productId=clean(b.product_id,80),quantity=Number(b.quantity),clock=tehranClock();
  const saleDate=b.sale_date||clock.date,saleTime=b.sale_time||clock.time;
  const channel=clean(b.sale_channel||"site",40),paymentMethod=clean(b.payment_method||"cash",40),paid=Number(b.amount_paid??0),customerName=clean(b.customer_name,160);
  if(!productId||!Number.isSafeInteger(quantity)||quantity<=0||!validDate(saleDate)||!validTime(saleTime)||!channel||!paymentMethod||!Number.isSafeInteger(paid)||paid<0||(b.customer_name!=null&&String(b.customer_name).trim()!==""&&!customerName))return fail(400,"VALIDATION_ERROR","اطلاعات فروش معتبر نیست.");
  const product=await env.DB.prepare("SELECT p.product_id,pp.purchase_price,pp.sell_price,pp.consumer_price FROM products p JOIN product_prices pp ON pp.product_id=p.product_id WHERE p.product_id=?").bind(productId).first();
  if(!product)return fail(404,"PRODUCT_NOT_FOUND","کالای انتخاب‌شده پیدا نشد.");
  const sellPrice=user.role==="employee"?Number(product.sell_price):(b.sell_price==null?Number(product.sell_price):Number(b.sell_price));
  const totalAmount=quantity*sellPrice;
  if(!Number.isSafeInteger(sellPrice)||sellPrice<0||!Number.isSafeInteger(totalAmount)||paid>totalAmount)return fail(400,"INVALID_PAYMENT","قیمت یا مبلغ پرداختی معتبر نیست.");
  try{
   const sale=await env.DB.prepare("INSERT INTO sales(product_id,quantity,sale_date,sale_time,sale_channel,purchase_price,sell_price,consumer_price,amount_paid,payment_method,customer_name) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id,product_id,quantity,sale_date,sale_time,sale_channel,purchase_price,sell_price,consumer_price,amount_paid,payment_method,total_amount,balance_amount,discount_amount,created_at,customer_name")
    .bind(productId,quantity,saleDate,saleTime,channel,Number(product.purchase_price),sellPrice,Number(product.consumer_price),paid,paymentMethod,customerName).first();
   return json({ok:true,data:{sale}},201);
  }catch(error){if(/INSUFFICIENT_STOCK/.test(String(error?.message||"")))return fail(409,"INSUFFICIENT_STOCK","موجودی کالا برای این فروش کافی نیست.");throw error;}
 }
 if(path==="/api/v1/attendance/check-in"&&method==="POST"){
  if(!canManage(user?.role,"attendance"))return fail(403,"FORBIDDEN","برای ثبت ورود مجوز کافی ندارید.");
  try{
   const attendance=await env.DB.prepare("INSERT INTO attendance(telegram_id,check_in) VALUES(?,datetime('now')) RETURNING id,telegram_id,check_in,check_out,duration_minutes,created_at").bind(user.telegram_id).first();
   return json({ok:true,data:{attendance}},201);
  }catch(error){
   if(/UNIQUE constraint failed: attendance\.telegram_id/i.test(String(error?.message||"")))return fail(409,"SHIFT_ALREADY_OPEN","برای این حساب یک ورود باز ثبت شده است.");
   throw error;
  }
 }
 if(path==="/api/v1/attendance/check-out"&&method==="POST"){
  if(!canManage(user?.role,"attendance"))return fail(403,"FORBIDDEN","برای ثبت خروج مجوز کافی ندارید.");
  const attendance=await env.DB.prepare("UPDATE attendance SET check_out=datetime('now'),duration_minutes=CAST((julianday(datetime('now'))-julianday(check_in))*1440 AS INTEGER) WHERE id=(SELECT id FROM attendance WHERE telegram_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1) AND check_out IS NULL RETURNING id,telegram_id,check_in,check_out,duration_minutes,created_at").bind(user.telegram_id).first();
  return attendance?json({ok:true,data:{attendance}}):fail(409,"NO_OPEN_SHIFT","برای این حساب ورود بازی وجود ندارد.");
 }
 if((path==="/api/v1/inventory/adjust"&&method==="POST")||(/^\/api\/v1\/debts\/\d+\/settle$/.test(path)&&method==="POST"))
  return fail(501,"LEDGER_REQUIRED","این عملیات تا ایجاد دفتر گردش قابل حسابرسی فعال نمی‌شود.");
 return null;
}
export async function userReadRoutes(request,env,url,user){
 if(url.pathname!=="/api/v1/users"||request.method!=="GET")return null;
 if(!canRead(user?.role,"users"))return fail(403,"FORBIDDEN","برای مشاهده کاربران مجوز کافی ندارید.");
 const {limit,offset}=parsePagination(url),q=(url.searchParams.get("q")||"").trim().slice(0,100),where=q?"WHERE instr(lower(full_name),lower(?))>0 OR instr(lower(COALESCE(username,'')),lower(?))>0":"",params=q?[q,q]:[];
 const rows=await env.DB.prepare("SELECT telegram_id,full_name,username,role,is_active,created_at FROM users "+where+" ORDER BY full_name COLLATE NOCASE LIMIT ? OFFSET ?").bind(...params,limit,offset).all();
 const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM users "+where).bind(...params).first();
 return json({ok:true,data:{items:rows.results||[],pagination:{limit,offset,total:Number(count?.total||0)}}});
}
