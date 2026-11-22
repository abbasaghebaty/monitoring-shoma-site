import React, { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Package, ShoppingCart, Warehouse, Users, Wallet, ChartNoAxesCombined, Clock3, Search, LogOut, RefreshCw, Menu, ChevronLeft, AlertCircle, Boxes } from "lucide-react";
import { api } from "./lib/api/endpoints";
import { setAccessToken, clearAccessToken } from "./lib/api/client";
import ProductsPage from "./pages/ProductsPage";

const NAV = [
  ["داشبورد", "dashboard", LayoutDashboard], ["محصولات", "products", Package],
  ["انبار و موجودی", "inventory", Warehouse], ["فروش", "sales", ShoppingCart],
  ["بدهی‌ها", "debts", Wallet], ["مشتریان", "customers", Users],
  ["ورود و خروج", "attendance", Clock3], ["گزارش فروش", "reports", ChartNoAxesCombined],
];
const MONEY = new Intl.NumberFormat("fa-IR");
const number = (value) => MONEY.format(Number(value || 0));
const money = (value) => number(value) + " تومان";
const date = (value) => value ? new Date(value).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Login({ onLogin }) {
  const [telegramId, setTelegramId] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState("");
  const [errorCode, setErrorCode] = useState("");
  async function requestCode(event) {
    event.preventDefault(); setBusy(true); setError(""); setRequestId(""); setErrorCode(""); setNotice("");
    try { const result = await api.requestOtp(telegramId.trim()); setSent(true); setNotice(result.message || "درخواست بررسی شد. اگر حساب فعال و مجاز باشد، در صورت امکان کد ورود از طریق تلگرام در اختیارتان قرار می‌گیرد."); }
    catch (e) { setError(e.message); setRequestId(e.requestId || ""); setErrorCode(e.errorCode || ""); } finally { setBusy(false); }
  }
  async function verify(event) {
    event.preventDefault(); setBusy(true); setError(""); setRequestId(""); setErrorCode("");
    try {
      const result = await api.verifyOtp(telegramId.trim(), code.trim());
      setAccessToken(result.token); onLogin(result.user);
    } catch (e) { setError(e.message); setRequestId(e.requestId || ""); setErrorCode(e.errorCode || ""); } finally { setBusy(false); }
  }
  return <main className="auth-screen" dir="rtl"><form className="auth-card" onSubmit={sent ? verify : requestCode}>
    <div className="brand-mark auth-mark">ش</div><span className="eyebrow">سامانه مدیریت فروشگاه شما</span>
    <h1>ورود امن به پنل</h1><p>برای دریافت کد یک‌بارمصرف، شناسه عددی تلگرام خود را وارد کنید. اگر قبلاً با ربات گفتگو نکرده‌اید، ابتدا ربات را در تلگرام باز کنید و /start را بزنید.</p>
    <label>Telegram ID</label><input value={telegramId} onChange={e=>setTelegramId(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="شناسه عددی تلگرام" required disabled={sent}/>
    {sent && <><label>کد ورود</label><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="کد ۶ رقمی دریافتی" required/></>}
    {error && <><div className="form-error"><AlertCircle size={16}/>{error}</div>{(errorCode || requestId) && <small className="auth-foot">{errorCode && <>کد خطا: {errorCode} · </>}کد پیگیری: {requestId || "در دسترس نیست"}</small>}</>}
    {notice && <div className="form-notice">{notice}</div>}
    <button className="primary-button auth-submit" disabled={busy}>{busy ? "لطفاً صبر کنید..." : sent ? "تأیید و ورود" : "ارسال کد ورود"}</button>
    {sent && <button type="button" className="text-button auth-back" onClick={()=>{setSent(false);setCode("");setNotice("");setError("");setRequestId("");setErrorCode("");}}>تغییر شناسه تلگرام</button>}
    <small className="auth-foot">کد ورود فقط از طریق ربات تلگرام فروشگاه ارسال می‌شود. اگر کدی دریافت نکردید، ربات را باز کنید و /start را بزنید؛ سپس دوباره درخواست دهید.</small>
  </form></main>;
}

function State({ loading, error, empty, onRetry }) {
  if (loading) return <div className="panel state-box"><RefreshCw className="spin"/><p>در حال دریافت اطلاعات از دیتابیس...</p></div>;
  if (error) return <div className="panel state-box error-state"><AlertCircle/><p>{error}</p><button className="soft-button" onClick={onRetry}>تلاش دوباره</button></div>;
  if (empty) return <div className="panel state-box"><Boxes/><p>برای این بخش هنوز داده‌ای ثبت نشده است.</p></div>;
  return null;
}

function Table({ columns, rows }) {
  return <div className="panel table-panel"><div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
    {rows.map((row,i)=><tr key={row.id ?? row.product_id ?? row.sale_id ?? row.telegram_id ?? i}>{columns.map(c=><td key={c.key}>{c.render ? c.render(row[c.key],row) : (row[c.key] ?? "—")}</td>)}</tr>)}
  </tbody></table></div></div>;
}

function Dashboard({ data }) {
  const cards = [
    ["تعداد محصولات", number(data.products?.count), Package],
    ["واحد موجودی", number(data.inventory?.unit_count), Warehouse],
    ["تعداد فروش", number(data.sales?.count), ShoppingCart],
    ["بدهی‌های باز", money(data.debts?.total), Wallet],
  ];
  return <><div className="metrics-grid">{cards.map(([label,value,Icon])=><div className="metric" key={label}><div className="metric-top">{label}<span className="metric-icon"><Icon size={18}/></span></div><strong>{value}</strong><div className="metric-foot">بر اساس اطلاعات ثبت‌شده در D1</div></div>)}</div>
    <div className="panel table-panel"><div className="panel-head"><h3>آخرین فروش‌ها</h3></div>
      <Table columns={[{key:"product_name",label:"محصول"},{key:"quantity",label:"تعداد"},{key:"sale_date",label:"تاریخ"},{key:"total_amount",label:"مبلغ",render:v=>money(v)},{key:"balance_amount",label:"مانده",render:v=>money(v)}]} rows={data.recentSales || []}/>
    </div>
  </>;
}

const TABLES = {
  inventory: { title:"انبار و موجودی", load:api.inventory, columns:[
    {key:"name",label:"محصول"},{key:"quantity",label:"موجودی",render:v=>number(v)},{key:"unit",label:"واحد"},
    {key:"purchase_price",label:"قیمت خرید",render:v=>money(v)},{key:"updated_at",label:"آخرین به‌روزرسانی",render:v=>date(v)}
  ]},
  sales: { title:"فروش‌ها", load:api.sales, columns:[
    {key:"id",label:"شناسه فروش"},{key:"product_name",label:"محصول"},{key:"quantity",label:"تعداد",render:v=>number(v)},
    {key:"sale_date",label:"تاریخ"},{key:"sale_time",label:"ساعت"},{key:"sale_channel",label:"کانال"},
    {key:"total_amount",label:"مبلغ کل",render:v=>money(v)},{key:"amount_paid",label:"پرداخت‌شده",render:v=>money(v)},
    {key:"balance_amount",label:"مانده",render:v=>money(v)},{key:"payment_method",label:"روش پرداخت"},{key:"customer_name",label:"مشتری"}
  ]},
  debts: { title:"بدهی‌ها", load:api.debts, columns:[
    {key:"sale_id",label:"فروش مرتبط"},{key:"customer_name",label:"مشتری"},{key:"product_name",label:"محصول"},
    {key:"amount",label:"مبلغ بدهی",render:v=>money(v)},{key:"status",label:"وضعیت"},{key:"created_at",label:"تاریخ",render:v=>date(v)}
  ]},
  customers: { title:"مشتریان", load:api.customers, columns:[
    {key:"name",label:"نام"},{key:"phone",label:"شماره تماس"},{key:"note",label:"یادداشت"},{key:"created_at",label:"تاریخ ثبت",render:v=>date(v)}
  ]},
  attendance: { title:"ورود و خروج کارکنان", load:api.attendance, columns:[
    {key:"full_name",label:"کارمند"},{key:"telegram_id",label:"شناسه تلگرام"},{key:"check_in",label:"ورود",render:v=>date(v)},
    {key:"check_out",label:"خروج",render:v=>date(v)},{key:"duration_minutes",label:"مدت (دقیقه)",render:v=>number(v)}
  ]},
};

export default function App() {
  const [user,setUser] = useState(null);
  const [active,setActive] = useState("dashboard");
  const [mobile,setMobile] = useState(false);
  const [data,setData] = useState(null);
  const [rows,setRows] = useState([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [reportData,setReportData] = useState(null);
  const [reportFrom,setReportFrom] = useState(new Date(Date.now()-29*86400000).toISOString().slice(0,10));
  const [reportTo,setReportTo] = useState(new Date().toISOString().slice(0,10));
  const allowedNav = useMemo(()=>NAV.filter(([,key])=>user?.role !== "employee" || key === "attendance"),[user]);
  const title = NAV.find(([,key])=>key===active)?.[0] || "داشبورد";
  async function load() {
    if (!user) return;
    setLoading(true); setError("");
    try {
      if (active === "dashboard") { setData(await api.dashboard()); setRows([]); }
      else if (active === "reports") { setReportData(await api.salesReport({from:reportFrom,to:reportTo})); setRows([]); }
      else if (active === "products") { setRows([]); }
      else {
        const config = TABLES[active];
        if (!config) { setRows([]); }
        else { const result = await config.load({q:query,limit:100}); setRows(result.items || []); }
      }
    } catch(e) { setError(e.message); if(e.status===401) setUser(null); }
    finally { setLoading(false); }
  }
  useEffect(()=>{load();},[user,active,refresh,reportFrom,reportTo]);
  useEffect(()=>{if(active!=="dashboard"){const timer=setTimeout(load,250);return()=>clearTimeout(timer);}},[query]);
  async function logout() { try { await api.logout(); } catch {} clearAccessToken(); setUser(null); setData(null); setRows([]); }
  if (!user) return <Login onLogin={setUser}/>;
  const table = TABLES[active];
  const pageTitle = active==="dashboard"?"داشبورد مدیریتی":table?.title || title;
  return <div className="app-shell" dir="rtl">
    <aside className={"sidebar "+(mobile?"sidebar-open":"")}><div className="brand"><div className="brand-mark">ش</div><div><b>شما</b><small>مدیریت فروشگاه</small></div><button className="close-menu" onClick={()=>setMobile(false)}>×</button></div>
      <div className="store-chip"><div className="store-avatar">ش</div><div><b>فروشگاه شما</b><small>پنل مدیریت</small></div><ChevronLeft size={16}/></div>
      <nav><div className="nav-group"><span className="nav-label">بخش‌های پنل</span>{allowedNav.map(([label,key,Icon])=><button key={key} className={"nav-item "+(active===key?"active":"")} onClick={()=>{setActive(key);setMobile(false);setQuery("");}}><Icon size={18}/><span>{label}</span></button>)}</div></nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="user-avatar">{(user.fullName||"؟").slice(0,1)}</div><div><b>{user.fullName}</b><small>{user.role==="owner"?"مالک":user.role==="manager"?"مدیر":"کارمند"}</small></div><button className="icon-button" title="خروج" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobile(!mobile)}><Menu/></button><div className="breadcrumb">شما <ChevronLeft size={14}/><b>{pageTitle}</b></div><div className="top-actions"><span className="api-indicator">اتصال امن فعال</span><button className="icon-button" onClick={()=>setRefresh(v=>v+1)} title="به‌روزرسانی"><RefreshCw size={17}/></button></div></header>
      <div className="content"><div className="page-title"><div><span className="eyebrow">مدیریت فروشگاه شما</span><h1>{pageTitle}</h1><p>اطلاعات زنده از دیتابیس مرکزی فروشگاه</p></div></div>
        {active==="reports" && <div className="toolbar date-toolbar"><label>از <input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)}/></label><label>تا <input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)}/></label></div>}
        {active!=="dashboard" && active!=="reports" && active!=="products" && table && <div className="toolbar"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جست‌وجو..."/></div></div>}
        {active!=="products" && <State loading={loading} error={error} empty={!loading&&!error&&(active==="dashboard"?!data:active==="reports"?!reportData:rows.length===0)} onRetry={()=>setRefresh(v=>v+1)}/>}
        {active==="products" && <ProductsPage canManage={user.role==="owner" || user.role==="manager"}/> }
        {!loading&&!error&&active==="dashboard"&&data&&<Dashboard data={data}/>}
        {!loading&&!error&&active!=="products"&&table&&rows.length>0&&<Table columns={table.columns} rows={rows}/>}
        {!loading&&!error&&active==="reports"&&reportData&&<><div className="metrics-grid compact"><div className="metric"><div className="metric-top">تعداد فروش</div><strong>{number(reportData.totals?.sale_count)}</strong></div><div className="metric"><div className="metric-top">مبلغ کل</div><strong>{money(reportData.totals?.total_amount)}</strong></div><div className="metric"><div className="metric-top">پرداخت‌شده</div><strong>{money(reportData.totals?.paid_amount)}</strong></div><div className="metric"><div className="metric-top">مانده</div><strong>{money(reportData.totals?.balance_amount)}</strong></div></div><Table columns={[{key:"sale_date",label:"تاریخ"},{key:"sale_count",label:"تعداد فروش",render:v=>number(v)},{key:"total_amount",label:"مبلغ کل",render:v=>money(v)}]} rows={reportData.daily||[]}/></>}
      </div><footer>شما · پنل مدیریت <span>عملیات کالا فقط برای نقش‌های مجاز فعال است؛ سوابق فروش تغییرناپذیرند</span></footer>
    </main>{mobile&&<button className="sidebar-scrim" onClick={()=>setMobile(false)} aria-label="بستن منو"/>}
  </div>;
}
