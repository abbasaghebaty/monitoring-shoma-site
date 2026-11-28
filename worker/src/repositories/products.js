import { parsePagination } from "../validation/common.js";

// Uses only columns present in the live shop-manager D1 schema.
const SELECT = [
  "SELECT p.product_id, p.name, p.unit, p.package_quantity, p.weight, p.weight_unit, p.description, p.created_at,",
  "COALESCE(pp.purchase_price,0) AS purchase_price, COALESCE(pp.sell_price,0) AS sell_price,",
  "COALESCE(pp.consumer_price,0) AS consumer_price, COALESCE(pp.market_price,0) AS market_price,",
  "COALESCE(i.quantity,0) AS quantity, pp.updated_at AS price_updated_at, i.updated_at AS inventory_updated_at",
  "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id",
  "LEFT JOIN inventory i ON i.product_id=p.product_id"
].join(" ");

const PRODUCT_FIELDS = ["name","unit","package_quantity","weight","weight_unit","description"];
const PRICE_FIELDS = ["purchase_price","sell_price","consumer_price","market_price"];

export class ProductNoChangesError extends Error {
  constructor() { super("Product has no changes"); this.name = "ProductNoChangesError"; }
}
export class ProductConflictError extends Error {
  constructor() { super("Product was modified by another request"); this.name = "ProductConflictError"; this.code = "PRODUCT_CONFLICT"; }
}

function requireAuditContext(context) {
  const actorTelegramId = Number(context?.actorTelegramId);
  const requestId = String(context?.requestId || "").trim();
  if (!Number.isSafeInteger(actorTelegramId) || actorTelegramId <= 0 || !requestId) {
    throw new TypeError("Product writes require actorTelegramId and requestId for audit");
  }
  return { actorTelegramId, requestId };
}

export async function listProducts(db, url) {
  const { limit, offset } = parsePagination(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0,100);
  const stock = url.searchParams.get("stock");
  const clauses=[], values=[];
  if(q){clauses.push("(p.name LIKE ? OR p.product_id LIKE ?)");values.push("%"+q+"%","%"+q+"%");}
  if(stock==="in_stock") clauses.push("COALESCE(i.quantity,0)>0");
  if(stock==="out_of_stock") clauses.push("COALESCE(i.quantity,0)=0");
  const where=clauses.length?" WHERE "+clauses.join(" AND "):"";
  const rows=await db.prepare(SELECT+where+" ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?").bind(...values,limit,offset).all();
  const count=await db.prepare("SELECT COUNT(*) AS total FROM products p LEFT JOIN inventory i ON i.product_id=p.product_id"+where).bind(...values).first();
  return {items:rows.results||[],pagination:{limit,offset,total:Number(count?.total||0)}};
}
export async function getProduct(db,id){return db.prepare(SELECT+" WHERE p.product_id=? LIMIT 1").bind(id).first();}

function normalize(field,value){
  if(["package_quantity","weight"].includes(field)) return value===""||value==null?null:Number(value);
  if(["weight_unit","description"].includes(field)) return value==null||value===""?null:String(value).trim();
  if(["name","unit"].includes(field)) return String(value??"").trim();
  return Number(value);
}
function auditInsert(db, context, productId, operation, previousValues, newValues) {
  const actor = context.actorTelegramId;
  return db.prepare(
    "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(actor, productId, operation, previousValues == null ? null : JSON.stringify(previousValues), JSON.stringify(newValues), context.requestId);
}

export async function createProduct(db,draft,rawContext){
  const context=requireAuditContext(rawContext);
  const id=String(draft.product_id).trim();
  const base={
    name:String(draft.name).trim(),unit:String(draft.unit||"عدد").trim(),
    package_quantity:draft.package_quantity===""||draft.package_quantity==null?null:Number(draft.package_quantity),
    weight:draft.weight===""||draft.weight==null?null:Number(draft.weight),
    weight_unit:draft.weight_unit?String(draft.weight_unit).trim():null,
    description:draft.description?String(draft.description).trim():null
  };
  const prices=Object.fromEntries(PRICE_FIELDS.map(f=>[f,Number(draft[f]??0)]));
  await db.batch([
    db.prepare("INSERT INTO products (product_id,name,unit,package_quantity,weight,weight_unit,description) VALUES (?,?,?,?,?,?,?)")
      .bind(id,base.name,base.unit,base.package_quantity,base.weight,base.weight_unit,base.description),
    // trg_product_initialize creates both dependent rows.
    db.prepare("UPDATE product_prices SET purchase_price=?,sell_price=?,consumer_price=?,market_price=? WHERE product_id=?")
      .bind(prices.purchase_price,prices.sell_price,prices.consumer_price,prices.market_price,id),
    auditInsert(db,context,id,"CREATE",null,{...base,...prices})
  ]);
  return getProduct(db,id);
}

export async function updateProduct(db,id,draft,rawContext){
  const context=requireAuditContext(rawContext);
  const current=await db.prepare(
    "SELECT p.product_id,p.name,p.unit,p.package_quantity,p.weight,p.weight_unit,p.description,"+
    "pp.product_id AS price_row_product_id,pp.purchase_price,pp.sell_price,pp.consumer_price,pp.market_price "+
    "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id WHERE p.product_id=?"
  ).bind(id).first();
  if(!current)return null;
  if(!current.price_row_product_id) throw new Error("Product price row is missing");

  const productChanges={},priceChanges={};
  for(const f of PRODUCT_FIELDS)if(Object.hasOwn(draft,f)){
    const v=normalize(f,draft[f]);if(!Object.is(v,current[f]))productChanges[f]=v;
  }
  for(const f of PRICE_FIELDS)if(Object.hasOwn(draft,f)){
    const v=Number(draft[f]);if(!Object.is(v,Number(current[f])))priceChanges[f]=v;
  }
  if(!Object.keys(productChanges).length&&!Object.keys(priceChanges).length)throw new ProductNoChangesError();

  const previousValues={...productChanges,...priceChanges};
  const newValues={...productChanges,...priceChanges};
  for(const key of Object.keys(previousValues)) previousValues[key]=current[key];

  const expectedProduct={};
  for(const field of PRODUCT_FIELDS) expectedProduct[field]=Object.hasOwn(productChanges,field)?productChanges[field]:current[field];
  const productSnapshot=PRODUCT_FIELDS.map(field=>field+" IS ?").join(" AND ");
  const priceSnapshot=PRICE_FIELDS.map(field=>field+" IS ?").join(" AND ");
  const statements=[];

  if(Object.keys(productChanges).length){
    const fields=Object.keys(productChanges);
    statements.push(db.prepare(
      "UPDATE products SET "+fields.map(f=>f+"=?").join(",")+
      " WHERE product_id=? AND "+productSnapshot+
      " AND EXISTS (SELECT 1 FROM product_prices WHERE product_id=? AND "+priceSnapshot+")"
    ).bind(
      ...fields.map(f=>productChanges[f]),id,
      ...PRODUCT_FIELDS.map(f=>current[f]),id,
      ...PRICE_FIELDS.map(f=>current[f])
    ));
  }
  if(Object.keys(priceChanges).length){
    const fields=Object.keys(priceChanges);
    statements.push(db.prepare(
      "UPDATE product_prices SET "+fields.map(f=>f+"=?").join(",")+
      " WHERE product_id=? AND "+priceSnapshot+
      " AND EXISTS (SELECT 1 FROM products WHERE product_id=? AND "+productSnapshot+")"
    ).bind(
      ...fields.map(f=>priceChanges[f]),id,
      ...PRICE_FIELDS.map(f=>current[f]),id,
      ...PRODUCT_FIELDS.map(f=>expectedProduct[f])
    ));
  }

  // The audit insert intentionally fails its NOT NULL constraint if the preceding
  // conditional update changed zero rows. D1 batch rollback then restores all prior statements.
  const audit=db.prepare(
    "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) "+
    "SELECT CASE WHEN changes()=1 THEN ? ELSE NULL END, ?, 'UPDATE', ?, ?, ?"
  ).bind(context.actorTelegramId,id,JSON.stringify(previousValues),JSON.stringify(newValues),context.requestId);
  statements.push(audit);

  try {
    await db.batch(statements);
  } catch(error) {
    if(/NOT NULL constraint failed: product_audit_log\.actor_telegram_id/i.test(String(error?.message||""))) {
      throw new ProductConflictError();
    }
    throw error;
  }
  return getProduct(db,id);
}
