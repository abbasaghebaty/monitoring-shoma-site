import { json } from "../utils/response.js";
import { canRead } from "../auth/permissions.js";
import { validIsoDate } from "../validation/common.js";
export async function dashboardRoutes(request, env, url, user) {
  const isSummary = url.pathname === "/api/v1/dashboard/summary";
  const isSalesReport = url.pathname === "/api/v1/reports/sales";
  if (!isSummary && !isSalesReport) return null;
  const resource = isSummary ? "dashboard" : "reports";
  if (!canRead(user.role, resource)) {
    return json({ok:false,error:{code:"FORBIDDEN",message:"برای مشاهده این گزارش مجوز ندارید."}},403);
  }
  if (isSummary) {
    const [products, inventory, sales, debts, recent] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM products").first(),
      env.DB.prepare("SELECT COUNT(*) AS products_with_stock, COALESCE(SUM(quantity),0) AS unit_count, COALESCE(SUM(quantity * purchase_price),0) AS stock_cost_value FROM inventory JOIN product_prices USING(product_id) WHERE quantity > 0").first(),
      env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS total, COALESCE(SUM(amount_paid),0) AS paid FROM sales").first(),
      env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM debts WHERE status='open'").first(),
      env.DB.prepare("SELECT s.id, p.name AS product_name, s.quantity, s.sale_date, s.sale_time, s.total_amount, s.amount_paid, s.balance_amount, s.customer_name FROM sales s JOIN products p ON p.product_id=s.product_id ORDER BY s.id DESC LIMIT 8").all(),
    ]);
    return json({ok:true,data:{products:products||{},inventory:inventory||{},sales:sales||{},debts:debts||{},recentSales:recent.results||[]}});
  }
  if (isSalesReport) {
    const from=url.searchParams.get("from"), to=url.searchParams.get("to");
    if (!validIsoDate(from) || !validIsoDate(to) || from > to) return json({ok:false,error:{code:"INVALID_DATE_RANGE",message:"بازه تاریخ معتبر نیست."}},400);
    const channel=(url.searchParams.get("channel")||"").trim().slice(0,40);
    const channelClause=channel ? " AND sale_channel=?" : "";
    const params=channel ? [from,to,channel] : [from,to];
    const [totals,daily,channels]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS sale_count, COALESCE(SUM(total_amount),0) AS total_amount, COALESCE(SUM(amount_paid),0) AS paid_amount, COALESCE(SUM(balance_amount),0) AS balance_amount FROM sales WHERE sale_date BETWEEN ? AND ?${channelClause}`).bind(...params).first(),
      env.DB.prepare(`SELECT sale_date, COUNT(*) AS sale_count, SUM(total_amount) AS total_amount FROM sales WHERE sale_date BETWEEN ? AND ?${channelClause} GROUP BY sale_date ORDER BY sale_date`).bind(...params).all(),
      env.DB.prepare(`SELECT sale_channel, COUNT(*) AS sale_count, SUM(total_amount) AS total_amount FROM sales WHERE sale_date BETWEEN ? AND ?${channelClause} GROUP BY sale_channel ORDER BY total_amount DESC`).bind(...params).all(),
    ]);
    return json({ok:true,data:{from,to,totals:totals||{},daily:daily.results||[],channels:channels.results||[]}});
  }
  return null;
}
