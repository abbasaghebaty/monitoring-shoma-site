import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Database, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../lib/api/endpoints";
import {
  INVENTORY_WORKSPACE_GROUPS,
  INVENTORY_WORKSPACE_MODULES,
} from "../modules/inventory-workspace/catalog";
import {
  formatWorkspaceMoney,
  formatWorkspaceNumber,
  getWorkspaceStatus,
  groupWorkspaceModules,
} from "../modules/inventory-workspace/model";
import MasterDataView from "../modules/inventory-workspace/MasterDataView";
import "./inventory-workspace.css";

function StatusPill({ status }) {
  const item = getWorkspaceStatus(status);
  return <span className={"iw-status " + item.tone}>{item.label}</span>;
}

function Metric({ label, value, note }) {
  return <article className="iw-metric">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

function ConnectedNotice({ children }) {
  return <div className="iw-notice connected"><ShieldCheck size={17}/><span>{children}</span></div>;
}

function ScaffoldNotice() {
  return <div className="iw-notice pending">
    <Info size={17}/>
    <span>این صفحه و ساختار رابط کاربری اضافه شده‌اند؛ اما API و جدول تأییدشده‌ای برای این عملیات در نسخه فعلی وجود ندارد. هیچ داده ساختگی نمایش داده نمی‌شود و هیچ عملیات نوشتنی فعال نیست.</span>
  </div>;
}

function ModuleCards({ modules, activeId, onSelect }) {
  return <div className="iw-module-grid">
    {modules.map((item) => {
      const Icon = item.icon;
      return <button className={"iw-module-card " + (activeId === item.id ? "selected" : "")} key={item.id} onClick={() => onSelect(item.id)}>
        <span className="iw-module-icon"><Icon size={19}/></span>
        <span className="iw-module-copy"><b>{item.title}</b><small>{item.description}</small></span>
        <StatusPill status={item.status}/>
        <ArrowUpRight className="iw-module-arrow" size={16}/>
      </button>;
    })}
  </div>;
}

function Overview({ summary, onSelect, onNavigate }) {
  const groups = useMemo(() => groupWorkspaceModules(INVENTORY_WORKSPACE_MODULES.filter((item) => item.id !== "overview"), INVENTORY_WORKSPACE_GROUPS), []);
  return <div className="iw-view">
    <div className="iw-intro">
      <div><span className="iw-eyebrow">INVENTORY CONTROL CENTER</span><h2>مرکز مدیریت کالا و انبار</h2><p>ساختار ماژولار مدیریت انبار؛ اطلاعات متصل از D1 و بخش‌های آماده توسعه در یک فضای واحد.</p></div>
      <button className="iw-primary" onClick={() => onNavigate("products")}>مدیریت کالاها <ArrowLeft size={16}/></button>
    </div>
    <div className="iw-metrics">
      <Metric label="تعداد کالاها" value={summary ? formatWorkspaceNumber(summary.products?.count) : "—"} note="منبع: جدول محصولات D1"/>
      <Metric label="واحدهای موجودی" value={summary ? formatWorkspaceNumber(summary.inventory?.unit_count) : "—"} note="موجودی ثبت‌شده فعلی"/>
      <Metric label="کالاهای دارای موجودی" value={summary ? formatWorkspaceNumber(summary.inventory?.products_with_stock) : "—"} note="بر اساس داده واقعی"/>
      <Metric label="ارزش خرید موجودی" value={summary ? formatWorkspaceMoney(summary.inventory?.stock_cost_value) : "—"} note="محاسبه‌شده از قیمت خرید"/>
    </div>
    <ConnectedNotice>آمار بالا از API فعلی Worker دریافت می‌شود. هیچ داده آزمایشی یا مقدار نمونه‌ای جایگزین اطلاعات واقعی نشده است.</ConnectedNotice>
    <div className="iw-section-heading"><div><h3>ماژول‌های مدیریت</h3><p>هر بخش مستقل است و می‌تواند در مرحله بعد توسعه پیدا کند.</p></div><span>{INVENTORY_WORKSPACE_MODULES.length - 1} بخش</span></div>
    {groups.map(({ group, items }) => <section className="iw-module-group" key={group}>
      <h4>{group}</h4>
      <ModuleCards modules={items} activeId="" onSelect={onSelect}/>
    </section>)}
  </div>;
}

function InventoryView({ items, loading, error, onRetry }) {
  return <div className="iw-view">
    <div className="iw-intro"><div><span className="iw-eyebrow">LIVE D1 DATA</span><h2>موجودی فعلی</h2><p>اطلاعات فقط از endpoint موجودی فعلی خوانده می‌شود؛ تغییر مقدار موجودی از این صفحه انجام نمی‌شود.</p></div></div>
    <ConnectedNotice>این بخش به API موجود GET /api/v1/inventory متصل است و فقط خواندنی است.</ConnectedNotice>
    {loading && <div className="iw-empty"><RefreshCw className="iw-spin"/><p>در حال دریافت موجودی از D1...</p></div>}
    {!loading && error && <div className="iw-empty error"><p>{error}</p><button className="iw-secondary" onClick={onRetry}>تلاش دوباره</button></div>}
    {!loading && !error && !items.length && <div className="iw-empty"><Database size={25}/><p>در حال حاضر رکوردی برای نمایش وجود ندارد.</p></div>}
    {!loading && !error && items.length > 0 && <div className="iw-table-wrap"><table className="iw-table"><thead><tr><th>نام کالا</th><th>شناسه</th><th>موجودی</th><th>واحد</th><th>قیمت خرید</th><th>آخرین تغییر</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.product_id}><td>{item.name || "—"}</td><td dir="ltr">{item.product_id}</td><td>{formatWorkspaceNumber(item.quantity)}</td><td>{item.unit || "—"}</td><td>{formatWorkspaceMoney(item.purchase_price)}</td><td>{item.updated_at || "—"}</td></tr>)}
    </tbody></table></div>}
  </div>;
}

function ProductsView({ onNavigate }) {
  return <div className="iw-view">
    <div className="iw-intro"><div><span className="iw-eyebrow">PRODUCT CATALOG</span><h2>مدیریت محصولات</h2><p>مدیریت مشخصات و چهار نوع قیمت کالا در صفحه اصلی مدیریت اجناس پیاده‌سازی شده است.</p></div><button className="iw-primary" onClick={() => onNavigate("products")}>باز کردن مدیریت اجناس <ArrowLeft size={16}/></button></div>
    <ConnectedNotice>صفحه اصلی محصولات به D1 متصل است و ایجاد/ویرایش را با مجوز owner و manager، کنترل هم‌زمانی و ثبت Audit انجام می‌دهد.</ConnectedNotice>
    <div className="iw-feature-grid">
      {["افزودن کالای جدید","ویرایش مشخصات کالا","مدیریت قیمت خرید و فروش","جست‌وجو و فیلتر موجودی","صفحه‌بندی فهرست کالاها","ثبت رویداد تغییرات در Audit"].map((item) => <div className="iw-feature" key={item}><ShieldCheck size={17}/>{item}</div>)}
    </div>
    <ScaffoldNotice/>
    <p className="iw-footnote">حذف، آرشیو، دسته‌بندی، برند، بارکد و تغییر موجودی در قرارداد فعلی API فعال نیستند؛ برای آن‌ها اینجا عملیات ساختگی اضافه نشده است.</p>
  </div>;
}

function ScaffoldView({ module }) {
  const capabilities = {
    categories: ["ساخت دسته‌بندی و زیردسته","اتصال کالاها به دسته‌بندی","نمایش تعداد کالا و ارزش موجودی هر دسته","جست‌وجو و مرتب‌سازی دسته‌ها"],
    brands: ["ثبت و ویرایش برند","اتصال برند به کالا","نمایش محصولات هر برند","گزارش تعداد و ارزش کالاهای برند"],
    warehouses: ["تعریف چند انبار","کد، نشانی و مسئول انبار","وضعیت فعال یا تعمیرات","نمای کلی ظرفیت و موجودی هر انبار"],
    locations: ["تعریف ناحیه و Zone","تعریف قفسه و Shelf","اتصال موقعیت به انبار","ظرفیت و وضعیت هر موقعیت"],
    movements: ["ورود و خروج کالا","ثبت مرجع و دلیل عملیات","نمایش زمان و عامل ثبت‌کننده","فیلتر بر اساس کالا، انبار و تاریخ"],
    adjustments: ["ثبت شمارش و اختلاف","افزایش یا کاهش با دلیل","تأیید عملیات حساس","ثبت سابقه قابل‌ردیابی"],
    transfers: ["انتخاب انبار مبدأ و مقصد","ثبت اقلام و تعداد","وضعیت پیش‌نویس تا دریافت","ثبت دو سوی گردش انتقال"],
    suppliers: ["اطلاعات تماس تأمین‌کننده","اتصال تأمین‌کننده به کالا","سوابق سفارش خرید","نمایش مجموع خریدها"],
    "purchase-orders": ["ایجاد سفارش چندقلمی","ثبت قیمت و تعداد سفارش","وضعیت تأیید و ارسال","تاریخ تحویل مورد انتظار"],
    receiving: ["دریافت کامل یا جزئی","اعتبارسنجی مقدار دریافتی","ارتباط با سفارش خرید","ثبت گردش ورودی کالا"],
    reorder: ["شناسایی کمبود موجودی","آستانه حداقل و نقطه سفارش","مقدار پیشنهادی تأمین","تأمین‌کننده پیشنهادی"],
    "stock-counts": ["تعریف دوره انبارگردانی","ثبت مقدار شمارش‌شده","محاسبه اختلاف","تبدیل اختلاف تأییدشده به سند اصلاح"],
    calendar: ["موعد تحویل سفارش‌ها","زمان ورود انتقال‌ها","برنامه انبارگردانی","فیلتر بازه زمانی"],
    analytics: ["ارزش کل موجودی","موجودی بر اساس انبار و دسته","روند گردش کالا","کالاهای پرفروش و کم‌گردش"],
    reports: ["گزارش موجودی کالا","گزارش کمبود و اتمام موجودی","گزارش گردش و انتقال","گزارش ارزش‌گذاری موجودی"],
    settings: ["واحد پول و قالب نمایش","قواعد هشدار کمبود","انبار پیش‌فرض","تنظیمات نمایش و صفحه‌بندی"],
  };
  return <div className="iw-view">
    <div className="iw-intro"><div><span className="iw-eyebrow">{module.group.toUpperCase()}</span><h2>{module.title}</h2><p>{module.description}</p></div><StatusPill status={module.status}/></div>
    <ScaffoldNotice/>
    <div className="iw-section-heading"><div><h3>ساختار قابلیت‌های این بخش</h3><p>این موارد به‌عنوان نقشه توسعه و اجزای صفحه اضافه شده‌اند.</p></div></div>
    <div className="iw-feature-grid">
      {(capabilities[module.id] || []).map((item) => <div className="iw-feature" key={item}><span className="iw-feature-dot"/>{item}</div>)}
    </div>
    <div className="iw-empty iw-empty-scaffold"><Database size={25}/><b>در انتظار اتصال به API و مدل داده</b><p>برای حفظ یکپارچگی اطلاعات فروشگاه، تا زمان بررسی Schema واقعی D1 و طراحی Migration سازگار، فرم ذخیره‌سازی و عملیات تغییردهنده فعال نمی‌شود.</p></div>
  </div>;
}

export default function InventoryWorkspacePage({ onNavigate = () => {} }) {
  const [active, setActive] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [summaryError, setSummaryError] = useState("");
  const [inventoryError, setInventoryError] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [reload, setReload] = useState(0);
  const activeModule = INVENTORY_WORKSPACE_MODULES.find((item) => item.id === active) || INVENTORY_WORKSPACE_MODULES[0];

  useEffect(() => {
    let current = true;
    setLoadingSummary(true);
    setSummaryError("");
    api.dashboard()
      .then((result) => { if (current) setSummary(result); })
      .catch((error) => { if (current) setSummaryError(error.message || "دریافت خلاصه اطلاعات ناموفق بود."); })
      .finally(() => { if (current) setLoadingSummary(false); });
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    if (active !== "inventory") return undefined;
    let current = true;
    setLoadingInventory(true);
    setInventoryError("");
    api.inventory({ limit: 100, offset: 0 })
      .then((result) => { if (current) setInventory(result.items || []); })
      .catch((error) => { if (current) setInventoryError(error.message || "دریافت موجودی ناموفق بود."); })
      .finally(() => { if (current) setLoadingInventory(false); });
    return () => { current = false; };
  }, [active, reload]);

  const grouped = useMemo(() => groupWorkspaceModules(INVENTORY_WORKSPACE_MODULES, INVENTORY_WORKSPACE_GROUPS), []);
  return <section className="inventory-workspace" dir="rtl">
    <div className="iw-shell-head">
      <div><span className="iw-eyebrow">SHOMA · INVENTORY</span><h2>مدیریت کالا و انبار</h2><p>فضای توسعه‌پذیر مدیریت موجودی، تأمین و گردش کالا</p></div>
      <button className="iw-refresh" onClick={() => setReload((value) => value + 1)} title="به‌روزرسانی داده‌های متصل"><RefreshCw size={16}/><span>به‌روزرسانی</span></button>
    </div>
    <div className="iw-layout">
      <aside className="iw-subnav">
        {grouped.map(({ group, items }) => <div className="iw-subnav-group" key={group}>
          <span>{group}</span>
          {items.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>
              <Icon size={16}/><span>{item.title}</span>{item.status === "connected" && <i/>}
            </button>;
          })}
        </div>)}
      </aside>
      <main className="iw-main">
        {active === "overview" && (loadingSummary
          ? <div className="iw-empty"><RefreshCw className="iw-spin"/><p>در حال دریافت خلاصه از D1...</p></div>
          : summaryError
            ? <div className="iw-empty error"><p>{summaryError}</p><button className="iw-secondary" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</button></div>
            : <Overview summary={summary} onSelect={setActive} onNavigate={onNavigate}/>)}
        {active === "inventory" && <InventoryView items={inventory} loading={loadingInventory} error={inventoryError} onRetry={() => setReload((value) => value + 1)}/>}
        {active === "products" && <ProductsView onNavigate={onNavigate}/>}
        {["categories", "brands", "warehouses", "locations"].includes(active) && <MasterDataView entity={active} onChanged={() => setReload((value) => value + 1)} />}
        {!["overview", "inventory", "products", "categories", "brands", "warehouses", "locations"].includes(active) && <ScaffoldView module={activeModule}/>}
      </main>
    </div>
  </section>;
}
