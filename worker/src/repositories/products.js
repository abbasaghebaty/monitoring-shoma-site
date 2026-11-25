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
export class ProductNoChangesError extends Error {}

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
export async function createProduct(db,draft){
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
      .bind(prices.purchase_price,prices.sell_price,prices.consumer_price,prices.market_price,id)
  ]);
  return getProduct(db,id);
}
export async function updateProduct(db,id,draft){
  const current=await db.prepare(
    "SELECT p.product_id,p.name,p.unit,p.package_quantity,p.weight,p.weight_unit,p.description,"+
    "pp.purchase_price,pp.sell_price,pp.consumer_price,pp.market_price FROM products p "+
    "LEFT JOIN product_prices pp ON pp.product_id=p.product_id WHERE p.product_id=?"
  ).bind(id).first();
  if(!current)return null;
  const productChanges={},priceChanges={};
  for(const f of PRODUCT_FIELDS)if(Object.hasOwn(draft,f)){
    const v=normalize(f,draft[f]);if(!Object.is(v,current[f]))productChanges[f]=v;
  }
  for(const f of PRICE_FIELDS)if(Object.hasOwn(draft,f)){
    const v=Number(draft[f]);if(!Object.is(v,Number(current[f])))priceChanges[f]=v;
  }
  if(!Object.keys(productChanges).length&&!Object.keys(priceChanges).length)throw new ProductNoChangesError();
  const statements=[];
  if(Object.keys(productChanges).length){
    const fields=Object.keys(productChanges);
    statements.push(db.prepare("UPDATE products SET "+fields.map(f=>f+"=?").join(",")+" WHERE product_id=?")
      .bind(...fields.map(f=>productChanges[f]),id));
  }
  if(Object.keys(priceChanges).length){
    const fields=Object.keys(priceChanges);
    statements.push(db.prepare("UPDATE product_prices SET "+fields.map(f=>f+"=?").join(",")+" WHERE product_id=?")
      .bind(...fields.map(f=>priceChanges[f]),id));
  }
  await db.batch(statements);
  return getProduct(db,id);
}
