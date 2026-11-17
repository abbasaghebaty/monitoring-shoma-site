import React, { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { LayoutDashboard, Package, ShoppingCart, Warehouse, Users, Truck, Wallet, ChartNoAxesCombined, FileBarChart, Settings, Search, Bell, Plus, ArrowDownLeft, ArrowUpLeft, Boxes, ReceiptText, Menu, ChevronLeft, CircleHelp, SlidersHorizontal, CalendarDays, MoreHorizontal } from "lucide-react";

const nav = [
  {group:"نمای کلی",items:[["داشبورد","dashboard",LayoutDashboard]]},
  {group:"عملیات فروشگاه",items:[["محصولات","products",Package],["ثبت فروش","sales",ShoppingCart],["انبار و موجودی","inventory",Warehouse],["خرید و تأمین‌کنندگان","purchases",Truck],["مشتریان","customers",Users]]},
  {group:"مالی و تحلیل",items:[["صندوق و هزینه‌ها","finance",Wallet],["گزارش‌ها و نمودارها","reports",ChartNoAxesCombined],["فاکتورها","invoices",ReceiptText]]},
  {group:"سیستم",items:[["تنظیمات","settings",Settings]]}
];
const sampleSales=[{day:"۱۱",value:3.2},{day:"۱۲",value:4.1},{day:"۱۳",value:3.7},{day:"۱۴",value:5.2},{day:"۱۵",value:4.6},{day:"۱۶",value:6.1},{day:"۱۷",value:5.5},{day:"۱۸",value:7.2},{day:"۱۹",value:6.4},{day:"۲۰",value:8.1},{day:"۲۱",value:7.5},{day:"۲۲",value:9.2}];
const products=[["مایع دستشویی","بهداشت شخصی","۱۲۴","۸۵٬۰۰۰","۱۱۰٬۰۰۰","موجود"],["پودر لباسشویی","شوینده لباس","۳۸","۱۸۰٬۰۰۰","۲۲۵٬۰۰۰","موجود"],["شامپو خانواده","مراقبت مو","۹","۱۳۵٬۰۰۰","۱۶۵٬۰۰۰","کم‌موجود"],["مایع ظرفشویی","شوینده ظروف","۰","۷۰٬۰۰۰","۹۵٬۰۰۰","ناموجود"],["دستمال کاغذی","سلولزی","۷۲","۵۵٬۰۰۰","۷۰٬۰۰۰","موجود"]];
const money=n=>new Intl.NumberFormat("fa-IR").format(n)+" تومان";
function Metric({title,value,delta,icon:Icon,tone="blue",sub}){return <article className="metric"><div className="metric-top"><span>{title}</span><span className={"metric-icon "+tone}><Icon size={19}/></span></div><strong>{value}</strong><div className="metric-foot"><span className="positive">{delta}</span><span>{sub}</span></div></article>}
function ChartCard(){return <section className="panel chart-panel"><div className="panel-head"><div><h3>روند فروش</h3><p>نمای کلی فروش در روزهای اخیر</p></div><button className="soft-button"><CalendarDays size={15}/> ۳۰ روز اخیر</button></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={sampleSales} margin={{top:12,right:4,left:4,bottom:0}}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b8def" stopOpacity={.28}/><stop offset="95%" stopColor="#5b8def" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#263448" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:"#8190a5",fontSize:11}}/><Tooltip contentStyle={{background:"#172235",border:"1px solid #2a3a52",borderRadius:12,color:"#fff"}} formatter={v=>[v+" میلیون","فروش"]}/><Area type="monotone" dataKey="value" stroke="#6e9df5" strokeWidth={2.5} fill="url(#salesFill)" /></AreaChart></ResponsiveContainer></div><div className="chart-caption"><span><i className="dot blue-dot"/> مبلغ فروش</span><span>مبالغ نمودار نمونه و نمایشی هستند</span></div></section>}
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
