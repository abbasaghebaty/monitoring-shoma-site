import { parsePagination } from "../validation/common.js";
export async function listProductPrices(db,url){
 const {limit,offset}=parsePagination(url),productId=(url.searchParams.get("product_id")||"").trim();
 const where=productId?"WHERE pp.product_id=?":"",params=productId?[productId]:[];
 const rows=await db.prepare("SELECT pp.product_id,p.name,pp.purchase_price,pp.sell_price,pp.consumer_price,pp.market_price,pp.updated_at FROM product_prices pp JOIN products p ON p.product_id=pp.product_id "+where+" ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?").bind(...params,limit,offset).all();
 const count=await db.prepare("SELECT COUNT(*) AS total FROM product_prices pp "+where).bind(...params).first();
 return {items:rows.results||[],pagination:{limit,offset,total:Number(count?.total||0)}};
}
