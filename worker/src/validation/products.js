const LIMITS={name:160,unit:30,weight_unit:20,description:2000};
export function validateProductDraft(input,{creating=false}={}){
 const errors={},allowed=new Set(["product_id","name","unit","package_quantity","weight","weight_unit","description","purchase_price","sell_price","consumer_price","market_price"]);
 for(const key of Object.keys(input||{}))if(!allowed.has(key))errors[key]="این فیلد در ساختار واقعی دیتابیس وجود ندارد.";
 if(creating){const id=String(input?.product_id??"").trim();if(!id)errors.product_id="شناسه کالا الزامی است.";else if(id.length>80||/[\/\\\u0000-\u001f]/.test(id))errors.product_id="شناسه کالا معتبر نیست.";}
 else if(Object.hasOwn(input||{},"product_id"))errors.product_id="شناسه اصلی کالا قابل تغییر نیست.";
 if(creating||Object.hasOwn(input||{},"name")){const v=String(input?.name??"").trim();if(!v)errors.name="نام کالا الزامی است.";else if(v.length>LIMITS.name)errors.name="نام کالا بیش از حد طولانی است.";}
 for(const f of ["unit","weight_unit","description"])if(Object.hasOwn(input||{},f)){const v=input[f]==null?"":String(input[f]).trim();if(f==="unit"&&!v)errors.unit="واحد کالا نمی‌تواند خالی باشد.";if(v.length>LIMITS[f])errors[f]="طول مقدار واردشده بیش از حد مجاز است.";}
 if(Object.hasOwn(input||{},"package_quantity")){const v=input.package_quantity;if(v!==null&&v!==""&&(!Number.isSafeInteger(Number(v))||Number(v)<=0))errors.package_quantity="تعداد در بسته باید عدد صحیح مثبت یا خالی باشد.";}
 if(Object.hasOwn(input||{},"weight")){const v=input.weight;if(v!==null&&v!==""&&(!Number.isFinite(Number(v))||Number(v)<=0))errors.weight="وزن باید عدد مثبت یا خالی باشد.";}
 for(const f of ["purchase_price","sell_price","consumer_price","market_price"])if(Object.hasOwn(input||{},f)){const v=input[f];if(!Number.isSafeInteger(Number(v))||Number(v)<0)errors[f]="قیمت باید عدد صحیح و غیرمنفی باشد.";}
 if(!creating&&!Object.keys(input||{}).some(k=>allowed.has(k)))errors._form="هیچ تغییری برای ذخیره ارسال نشده است.";
 return errors;
}
