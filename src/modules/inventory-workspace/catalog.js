import {
  Activity, Archive, BarChart3, Boxes, CalendarDays, ClipboardCheck,
  ClipboardList, FileBarChart, Layers3, MapPin, Package, PackageCheck,
  PackagePlus, Repeat2, Settings2, ShoppingBasket, Truck, Warehouse,
} from "lucide-react";

// Navigation and capability metadata for the additive inventory workspace.
// "connected" means an existing authenticated API can supply real data;
// "scaffold" means the UI is intentionally present without pretending an API exists.
export const INVENTORY_WORKSPACE_MODULES = [
  { id: "overview", title: "نمای کلی", group: "نمای کلی", icon: BarChart3, status: "connected", description: "نمای کلی عملیات کالا و انبار بر پایه داده‌های موجود در D1." },
  { id: "products", title: "محصولات", group: "کالا و انبار", icon: Package, status: "connected", description: "مدیریت مشخصات و قیمت کالا از صفحه فعلی مدیریت اجناس." },
  { id: "categories", title: "دسته‌بندی‌ها", group: "کالا و انبار", icon: Layers3, status: "scaffold", description: "ساختار دسته‌بندی و گروه‌بندی کالاها." },
  { id: "brands", title: "برندها", group: "کالا و انبار", icon: Archive, status: "scaffold", description: "مدیریت برندها و اتصال آن‌ها به محصولات." },
  { id: "warehouses", title: "انبارها", group: "ساختار انبار", icon: Warehouse, status: "scaffold", description: "تعریف چند انبار و مشاهده ظرفیت و وضعیت هرکدام." },
  { id: "locations", title: "موقعیت‌ها", group: "ساختار انبار", icon: MapPin, status: "scaffold", description: "تعریف ناحیه، قفسه و محل نگهداری در هر انبار." },
  { id: "inventory", title: "موجودی", group: "ساختار انبار", icon: Boxes, status: "connected", description: "مشاهده موجودی واقعی فعلی؛ عملیات نوشتنی هنوز فعال نیست." },
  { id: "movements", title: "گردش موجودی", group: "عملیات انبار", icon: Activity, status: "scaffold", description: "تاریخچه ورود، خروج و تغییرات موجودی با سند مرجع." },
  { id: "adjustments", title: "اصلاح موجودی", group: "عملیات انبار", icon: ClipboardCheck, status: "scaffold", description: "ثبت اختلاف شمارش و اصلاح کنترل‌شده موجودی." },
  { id: "transfers", title: "انتقال بین انبارها", group: "عملیات انبار", icon: Repeat2, status: "scaffold", description: "انتقال قابل‌ردیابی کالا میان انبارها." },
  { id: "suppliers", title: "تأمین‌کنندگان", group: "تأمین", icon: Truck, status: "scaffold", description: "اطلاعات تأمین‌کننده و ارتباط آن با خریدها." },
  { id: "purchase-orders", title: "سفارش‌های خرید", group: "تأمین", icon: ShoppingBasket, status: "scaffold", description: "ایجاد و پیگیری سفارش خرید و اقلام آن." },
  { id: "receiving", title: "دریافت کالا", group: "تأمین", icon: PackageCheck, status: "scaffold", description: "ثبت دریافت کامل یا بخشی از سفارش خرید." },
  { id: "reorder", title: "پیشنهاد سفارش مجدد", group: "تأمین", icon: PackagePlus, status: "scaffold", description: "شناسایی کالاهای نیازمند تأمین مجدد." },
  { id: "stock-counts", title: "انبارگردانی", group: "عملیات انبار", icon: ClipboardList, status: "scaffold", description: "برنامه‌ریزی شمارش و ثبت اختلاف موجودی." },
  { id: "calendar", title: "تقویم عملیات", group: "تحلیل", icon: CalendarDays, status: "scaffold", description: "نمایش موعد تحویل خریدها، انتقال‌ها و شمارش‌ها." },
  { id: "analytics", title: "تحلیل انبار", group: "تحلیل", icon: BarChart3, status: "scaffold", description: "تحلیل ارزش موجودی، گردش کالا و عملکرد تأمین." },
  { id: "reports", title: "گزارش‌های انبار", group: "تحلیل", icon: FileBarChart, status: "scaffold", description: "گزارش موجودی، کمبود، گردش، انتقال و ارزش کالا." },
  { id: "settings", title: "تنظیمات انبار", group: "سیستم", icon: Settings2, status: "scaffold", description: "تنظیم واحدها، آستانه کمبود، ارز و ترجیحات نمایش." },
];

export const INVENTORY_WORKSPACE_GROUPS = [
  "نمای کلی", "کالا و انبار", "ساختار انبار", "عملیات انبار", "تأمین", "تحلیل", "سیستم",
];
