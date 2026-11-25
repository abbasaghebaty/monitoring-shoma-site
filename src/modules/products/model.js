// Product fields mirror the live D1 products and product_prices tables.
export const PRODUCT_FIELDS=[
 "product_id","name","unit","package_quantity","weight","weight_unit","description",
 "purchase_price","sell_price","consumer_price","market_price"
];
export function validateProductDraft(draft,{creating=false}={}){
 const errors={},allowed=new Set(PRODUCT_FIELDS);
 for(const key of Object.keys(draft||{}))if(!allowed.has(key))errors[key]="این فیلد در ساختار واقعی دیتابیس وجود ندارد.";
 if(creating){const id=String(draft?.product_id??"").trim();if(!id)errors.product_id="شناسه کالا الزامی است.";else if(id.length>80||/[\/\\\u0000-\u001f]/.test(id))errors.product_id="شناسه کالا معتبر نیست.";}
 else if(Object.hasOwn(draft||{},"product_id"))errors.product_id="شناسه اصلی کالا قابل تغییر نیست.";
 if(creating||Object.hasOwn(draft||{},"name")){const v=String(draft?.name??"").trim();if(!v)errors.name="نام کالا الزامی است.";else if(v.length>160)errors.name="نام کالا بیش از حد طولانی است.";}
 for(const [f,max] of [["unit",30],["weight_unit",20],["description",2000]])if(Object.hasOwn(draft||{},f)){const v=draft[f]==null?"":String(draft[f]).trim();if(f==="unit"&&!v)errors.unit="واحد کالا نمی‌تواند خالی باشد.";if(v.length>max)errors[f]="طول مقدار واردشده بیش از حد مجاز است.";}
 if(Object.hasOwn(draft||{},"package_quantity")){const v=draft.package_quantity;if(v!==null&&v!==""&&(!Number.isSafeInteger(Number(v))||Number(v)<=0))errors.package_quantity="تعداد در بسته باید عدد صحیح مثبت یا خالی باشد.";}
 if(Object.hasOwn(draft||{},"weight")){const v=draft.weight;if(v!==null&&v!==""&&(!Number.isFinite(Number(v))||Number(v)<=0))errors.weight="وزن باید عدد مثبت یا خالی باشد.";}
 for(const f of ["purchase_price","sell_price","consumer_price","market_price"])if(Object.hasOwn(draft||{},f)){const v=draft[f];if(!Number.isSafeInteger(Number(v))||Number(v)<0)errors[f]="قیمت باید عدد صحیح و غیرمنفی باشد.";}
 if(!creating&&!Object.keys(draft||{}).some(k=>allowed.has(k)))errors._form="هیچ تغییری برای ذخیره ارسال نشده است.";
 return errors;
}
