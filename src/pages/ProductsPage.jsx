import React, { useEffect, useState } from "react";
import { api } from "../lib/api/endpoints";
import { validateProductDraft } from "../modules/products/model";

const LIMIT = 25;
const EMPTY = { product_id:"", name:"", unit:"عدد", package_quantity:"", weight:"", weight_unit:"", description:"", barcode:"", category_id:"", brand_id:"", min_stock:"0", is_active:"1", purchase_price:"0", sell_price:"0", consumer_price:"0", market_price:"0" };
const PRICES = [["purchase_price","قیمت خرید"],["sell_price","قیمت فروش"],["consumer_price","قیمت مصرف‌کننده"],["market_price","قیمت بازار"]];
const money = (v) => new Intl.NumberFormat("fa-IR").format(Number(v || 0)) + " تومان";
const count = (v) => new Intl.NumberFormat("fa-IR").format(Number(v || 0));
const draftOf = (p) => p ? Object.fromEntries(Object.keys(EMPTY).map(k=>[k,p[k] == null ? "" : String(p[k])])) : {...EMPTY};
function payloadOf(d, creating) {
  const p = {
    name:d.name.trim(), unit:d.unit.trim(),
    package_quantity:d.package_quantity === "" ? null : Number(d.package_quantity),
    weight:d.weight === "" ? null : Number(d.weight),
    weight_unit:d.weight_unit.trim(), description:d.description.trim(),
    purchase_price:Number(d.purchase_price), sell_price:Number(d.sell_price),
    consumer_price:Number(d.consumer_price), market_price:Number(d.market_price),
    barcode:d.barcode.trim() || null, category_id:d.category_id || null, brand_id:d.brand_id || null,
    min_stock:Number(d.min_stock || 0), is_active:Number(d.is_active),
  };
  if (creating) p.product_id=d.product_id.trim();
  return p;
}

function ProductEditor({ product, onClose, onSaved }) {
  const creating=!product;
  const [draft,setDraft]=useState(()=>draftOf(product));
  const [errors,setErrors]=useState({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [references,setReferences]=useState({categories:[],brands:[]});
  useEffect(()=>{
    let current=true;
    Promise.all([
      api.inventoryWorkspace("categories",{limit:100,offset:0}),
      api.inventoryWorkspace("brands",{limit:100,offset:0}),
    ]).then(([categories,brands])=>{if(current)setReferences({categories:categories.items||[],brands:brands.items||[]});})
      .catch(()=>{if(current)setError("دریافت فهرست دسته‌بندی و برند ناموفق بود؛ می‌توانی اطلاعات دیگر کالا را تکمیل کنی.");});
    return ()=>{current=false;};
  },[]);
  const set=(key,value)=>{setDraft(d=>({...d,[key]:value}));setErrors(e=>({...e,[key]:undefined}));};
  async function submit(event) {
    event.preventDefault();
    const payload=payloadOf(draft,creating);
    const next=validateProductDraft(payload,{creating});
    setErrors(next);
    if(Object.keys(next).length) return;
    setBusy(true);setError("");
    try {
      if(creating) await api.createProduct(payload);
      else await api.updateProduct(product.product_id,payload);
      onSaved(creating?"کالای جدید ثبت شد.":"تغییرات کالا ذخیره شد.");
    } catch(e) {
      setError(e.message || "ذخیره کالا انجام نشد.");
      if(e.payload?.error?.fields) setErrors(e.payload.error.fields);
    } finally {setBusy(false);}
  }
  const input=(key,label,opts={})=><label className="product-field" key={key}><span>{label}{opts.required?" *":""}</span><input
    type={opts.type||"text"} value={draft[key]} onChange={e=>set(key,e.target.value)}
    required={!!opts.required} disabled={busy||!!opts.disabled} min={opts.min} step={opts.step}
    maxLength={opts.maxLength} dir={opts.ltr?"ltr":"auto"}/>{errors[key]&&<small className="field-error">{errors[key]}</small>}</label>;
  return <div className="product-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <form className="product-editor panel" onSubmit={submit} dir="rtl">
      <div className="product-editor-head"><div><span className="eyebrow">کاتالوگ کالا</span><h2>{creating?"افزودن کالای جدید":"ویرایش کالا"}</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy}>×</button></div>
      {error&&<div className="product-alert error">{error}</div>}
      <div className="product-form-grid">
        {creating&&input("product_id","شناسه کالا / کد",{required:true,ltr:true,maxLength:80})}
        {input("name","نام کالا",{required:true,maxLength:160})}
        {input("unit","واحد شمارش",{required:true,maxLength:30})}
        {input("package_quantity","تعداد در بسته",{type:"number",min:"1",step:"1"})}
        {input("weight","وزن",{type:"number",min:"0.001",step:"any"})}
        {input("weight_unit","واحد وزن",{maxLength:20})}
        {input("barcode","بارکد",{ltr:true,maxLength:100})}
        <label className="product-field"><span>دسته‌بندی</span><select value={draft.category_id} onChange={e=>set("category_id",e.target.value)} disabled={busy}><option value="">بدون دسته‌بندی</option>{references.categories.map(item=><option key={item.id} value={item.id} disabled={Number(item.is_active)!==1}>{item.name}{Number(item.is_active)!==1?" (غیرفعال)":""}</option>)}</select>{errors.category_id&&<small className="field-error">{errors.category_id}</small>}</label>
        <label className="product-field"><span>برند</span><select value={draft.brand_id} onChange={e=>set("brand_id",e.target.value)} disabled={busy}><option value="">بدون برند</option>{references.brands.map(item=><option key={item.id} value={item.id} disabled={Number(item.is_active)!==1}>{item.name}{Number(item.is_active)!==1?" (غیرفعال)":""}</option>)}</select>{errors.brand_id&&<small className="field-error">{errors.brand_id}</small>}</label>
        {input("min_stock","حداقل موجودی",{type:"number",min:"0",step:"1",ltr:true})}
        <label className="product-field"><span>وضعیت کالا</span><select value={draft.is_active} onChange={e=>set("is_active",e.target.value)} disabled={busy}><option value="1">فعال</option><option value="0">غیرفعال</option></select>{errors.is_active&&<small className="field-error">{errors.is_active}</small>}</label>
        {PRICES.map(([key,label])=>input(key,label+" (تومان)",{type:"number",min:"0",step:"1",ltr:true,required:true}))}
        <label className="product-field product-description"><span>توضیحات</span><textarea rows="3" maxLength="2000" value={draft.description} onChange={e=>set("description",e.target.value)} disabled={busy}/>{errors.description&&<small className="field-error">{errors.description}</small>}</label>
      </div>
      <p className="product-schema-note">این فرم فقط مشخصات کالا را ذخیره می‌کند. تغییر تعداد موجودی و گردش کالا همچنان از این صفحه انجام نمی‌شود.</p>
      <div className="product-editor-actions"><button type="button" className="soft-button" onClick={onClose} disabled={busy}>انصراف</button><button type="submit" className="primary-button" disabled={busy}>{busy?"در حال ذخیره...":"ذخیره اطلاعات"}</button></div>
    </form>
  </div>;
}

export default function ProductsPage({ canManage=false }) {
  const [items,setItems]=useState([]);
  const [pagination,setPagination]=useState({total:0});
  const [query,setQuery]=useState("");
  const [stock,setStock]=useState("");
  const [page,setPage]=useState(0);
  const [reload,setReload]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState(null);
  useEffect(()=>{
    let current=true;setLoading(true);setError("");
    api.products({q:query,stock,limit:LIMIT,offset:page*LIMIT})
      .then(r=>{if(current){setItems(r.items||[]);setPagination(r.pagination||{total:0});}})
      .catch(e=>{if(current)setError(e.message||"دریافت فهرست کالاها ناموفق بود.");})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[query,stock,page,reload]);
  const pages=Math.max(1,Math.ceil(Number(pagination.total||0)/LIMIT));
  function saved(message){setEditor(null);setNotice(message);setReload(v=>v+1);}
  return <section className="products-page" dir="rtl">
    <div className="products-toolbar">
      <div className="products-filters">
        <label className="search-box"><span>⌕</span><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="جست‌وجو بر اساس نام یا شناسه کالا..."/></label>
        <select value={stock} onChange={e=>{setStock(e.target.value);setPage(0);}} aria-label="فیلتر موجودی"><option value="">همه کالاها</option><option value="in_stock">دارای موجودی</option><option value="out_of_stock">بدون موجودی</option></select>
      </div>
      {canManage&&<button className="primary-button" onClick={()=>setEditor({product:null})}>＋ افزودن کالا</button>}
    </div>
    {notice&&<div className="product-alert success"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}
    {loading&&<div className="panel state-box"><span className="spin">◌</span><p>در حال دریافت کالاها از D1...</p></div>}
    {!loading&&error&&<div className="panel state-box error-state"><p>{error}</p><button className="soft-button" onClick={()=>setReload(v=>v+1)}>تلاش دوباره</button></div>}
    {!loading&&!error&&!items.length&&<div className="panel state-box"><p>کالایی با این شرایط پیدا نشد.</p></div>}
    {!loading&&!error&&items.length>0&&<div className="panel table-panel product-table-panel">
      <div className="product-table-scroll"><table><thead><tr><th>نام کالا</th><th>شناسه</th><th>واحد</th><th>قیمت خرید</th><th>قیمت فروش</th><th>بارکد</th><th>دسته‌بندی</th><th>حداقل موجودی</th><th>وضعیت</th><th>موجودی</th>{canManage&&<th>عملیات</th>}</tr></thead>
        <tbody>{items.map(p=><tr key={p.product_id}><td className="product-name-cell">{p.name}</td><td dir="ltr">{p.product_id}</td><td>{p.unit||"—"}</td><td>{money(p.purchase_price)}</td><td>{money(p.sell_price)}</td><td dir="ltr">{p.barcode||"—"}</td><td>{p.category_name||"—"}</td><td>{count(p.min_stock)}</td><td>{Number(p.is_active)===1?"فعال":"غیرفعال"}</td><td><span className={"stock-chip "+(Number(p.quantity)>0?"has-stock":"no-stock")}>{count(p.quantity)}</span></td>{canManage&&<td><button className="soft-button product-edit-button" onClick={()=>setEditor({product:p})}>ویرایش</button></td>}</tr>)}</tbody>
      </table></div>
      <div className="product-pagination"><span>{count(pagination.total)} کالا · صفحه {count(page+1)} از {count(pages)}</span><div><button className="soft-button" disabled={page<=0} onClick={()=>setPage(v=>Math.max(0,v-1))}>قبلی</button><button className="soft-button" disabled={page+1>=pages} onClick={()=>setPage(v=>v+1)}>بعدی</button></div></div>
    </div>}
    <p className="product-schema-note standalone-note">موجودی فقط نمایش داده می‌شود و از این صفحه قابل تغییر نیست. غیرفعال‌سازی کالا فقط روی وضعیت کاتالوگ اثر دارد و سابقه فروش یا موجودی را حذف نمی‌کند.</p>
    {editor&&<ProductEditor product={editor.product} onClose={()=>setEditor(null)} onSaved={saved}/>}
  </section>;
}
