import { parsePagination } from "../validation/common.js";
export async function listSales(db, url) {
  const { limit, offset } = parsePagination(url);
  const from=url.searchParams.get("from"), to=url.searchParams.get("to");
  const channel=(url.searchParams.get("channel")||"").trim().slice(0,40);
  const q=(url.searchParams.get("q")||"").trim().slice(0,100);
  const clauses=[], values=[];
  if(from){clauses.push("s.sale_date >= ?");values.push(from);}
  if(to){clauses.push("s.sale_date <= ?");values.push(to);}
  if(channel){clauses.push("s.sale_channel = ?");values.push(channel);}
  if(q){clauses.push("(instr(lower(p.name),lower(?))>0 OR instr(lower(COALESCE(s.customer_name,'')),lower(?))>0)");values.push(q,q);}
  const where=clauses.length?"WHERE "+clauses.join(" AND "):"";
  const {results=[]}=await db.prepare(`
    SELECT s.id,s.product_id,p.name AS product_name,s.quantity,s.sale_date,s.sale_time,
      s.sale_channel,s.purchase_price,s.sell_price,s.consumer_price,s.amount_paid,
      s.payment_method,s.total_amount,s.balance_amount,s.discount_amount,
      s.created_at,s.customer_name,d.status AS debt_status
    FROM sales s JOIN products p ON p.product_id=s.product_id
    LEFT JOIN debts d ON d.sale_id=s.id
    ${where} ORDER BY s.sale_date DESC,s.sale_time DESC,s.id DESC LIMIT ? OFFSET ?
  `).bind(...values,limit,offset).all();
  const count=await db.prepare(`
    SELECT COUNT(*) AS total FROM sales s JOIN products p ON p.product_id=s.product_id ${where}
  `).bind(...values).first();
  return {items:results,pagination:{limit,offset,total:Number(count?.total||0)}};
}
