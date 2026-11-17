export const REPORT_CATALOG = [
  { id: "sales-daily", title: "فروش روزانه", dimensions: ["date", "total", "count"] },
  { id: "sales-period", title: "فروش بازه‌ای", dimensions: ["date", "total", "count"] },
  { id: "product-performance", title: "عملکرد محصولات", dimensions: ["product", "quantity", "revenue"] },
  { id: "inventory-value", title: "ارزش موجودی", dimensions: ["product", "quantity", "cost"] },
  { id: "low-stock", title: "کالاهای کم‌موجود", dimensions: ["product", "stock", "minimum"] },
  { id: "customer-balances", title: "مانده حساب مشتریان", dimensions: ["customer", "debit", "credit"] },
  { id: "profitability", title: "تحلیل سود", dimensions: ["period", "gross_margin", "expenses", "net_profit"] },
];
