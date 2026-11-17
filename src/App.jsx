import React, { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { LayoutDashboard, Package, ShoppingCart, Warehouse, Users, Truck, Wallet, ChartNoAxesCombined, FileBarChart, Settings, Search, Bell, Plus, ArrowDownLeft, ArrowUpLeft, Boxes, ReceiptText, Menu, ChevronLeft, CircleHelp, SlidersHorizontal, CalendarDays, MoreHorizontal, Clock3 } from "lucide-react";

const nav = [
  {group:"نمای کلی",items:[["داشبورد","dashboard",LayoutDashboard]]},
  {group:"عملیات فروشگاه",items:[["محصولات","products",Package],["ثبت فروش","sales",ShoppingCart],["انبار و موجودی","inventory",Warehouse],["خرید و تأمین‌کنندگان","purchases",Truck],["مشتریان","customers",Users]]},
  {group:"پرسنل",items:[["ورود و خروج","attendance",Clock3]]},
  {group:"مالی و تحلیل",items:[["صندوق و هزینه‌ها","finance",Wallet],["گزارش‌ها و نمودارها","reports",ChartNoAxesCombined],["فاکتورها","invoices",ReceiptText]]},
  {group:"سیستم",items:[["تنظیمات","settings",Settings]]}
];
function DataPending({title,description}) {
  return <section className="panel empty-state">
    <div className="empty-icon"><Boxes size={25}/></div>
    <h2>{title}</h2>
    <p>{description}</p>
    <span className="status neutral">در انتظار اتصال امن به داده‌های واقعی</span>
  </section>;
}
function Dashboard(){
  return <>
    <div className="page-title"><div><span className="eyebrow">مدیریت فروشگاه شما</span><h1>داشبورد مدیریتی</h1><p>نمای کلی اطلاعات واقعی فروشگاه</p></div></div>
    <DataPending title="آمار واقعی هنوز دریافت نشده" description="تا زمانی که اتصال Worker، دسترسی امن و تطبیق ساختار D1 کامل نشود، هیچ عدد یا نمودار ساختگی نمایش داده نمی‌شود."/>
  </>;
}
function Products(){
  return <>
    <div className="page-title"><div><span className="eyebrow">کاتالوگ فروشگاه</span><h1>مدیریت محصولات</h1><p>مشاهده و مدیریت اطلاعات پایه کالاها</p></div></div>
    <DataPending title="فهرست محصولات در انتظار اتصال" description="محصولات از جدول واقعی فروشگاه خوانده خواهند شد. فرم افزودن و ویرایش پس از تطبیق کامل schema و طراحی مدل ویژگی‌های متغیر فعال می‌شود."/>
  </>;
}
function Placeholder({title}){return <div className="empty-state panel"><div className="empty-icon"><SlidersHorizontal size={25}/></div><h2>{title}</h2><p>نمای این بخش آماده است؛ اتصال داده و عملیات آن طبق نقشه راه ماژولار تکمیل می‌شود.</p></div>}
export default function App(){const [active,setActive]=useState("dashboard"),[mobile,setMobile]=useState(false);const title=useMemo(()=>nav.flatMap(g=>g.items).find(x=>x[1]===active)?.[0]||"داشبورد", [active]);return <div className="app-shell"><aside className={"sidebar "+(mobile?"sidebar-open":"")}><div className="brand"><div className="brand-mark">ش</div><div><b>شما</b><small>مدیریت فروشگاه</small></div><button className="close-menu" onClick={()=>setMobile(false)}>×</button></div><div className="store-chip"><div className="store-avatar">ش</div><div><b>فروشگاه شما</b><small>شعبه اصلی</small></div><ChevronLeft size={16}/></div><nav>{nav.map(group=><div className="nav-group" key={group.group}><span className="nav-label">{group.group}</span>{group.items.map(([label,key,Icon])=><button key={key} className={"nav-item "+(active===key?"active":"")} onClick={()=>{setActive(key);setMobile(false)}}><Icon size={18}/><span>{label}</span>{key==="sales"&&<span className="nav-badge">+</span>}</button>)}</div>)}</nav><div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18}/><div><b>راهنمای سیستم</b><small>راهنمای استفاده از پنل</small></div></div><div className="user-card"><div className="user-avatar">ع</div><div><b>مدیر فروشگاه</b><small>دسترسی مدیر</small></div><MoreHorizontal size={18}/></div></div></aside><main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobile(!mobile)}><Menu/></button><div className="breadcrumb">شما <ChevronLeft size={14}/><b>{title}</b></div><div className="top-actions"><div className="top-search"><Search size={16}/><input placeholder="جست‌وجو در پنل..."/></div><button className="icon-button notification"><Bell size={19}/><i/></button><div className="top-avatar">ع</div></div></header><div className="content">{active==="dashboard"?<Dashboard/>:active==="products"?<Products/>:<><div className="page-title"><div><span className="eyebrow">مدیریت فروشگاه شما</span><h1>{title}</h1><p>مدیریت و بررسی {title} فروشگاه</p></div></div><Placeholder title={title}/></>}</div><footer>شما داشبورد <span>نسخه ۰.۱.۰ · رابط کاربری اولیه</span></footer></main>{mobile&&<button className="sidebar-scrim" onClick={()=>setMobile(false)} aria-label="بستن منو"/>}</div>}
