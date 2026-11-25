import React,{useCallback,useEffect,useMemo,useState} from "react";
import {Database,Edit2,Plus,RefreshCw,Save,X} from "lucide-react";
import {api} from "../../lib/api/endpoints";

const DEFINITIONS={
 categories:{title:"دسته‌بندی‌ها",fields:[["name","نام دسته‌بندی","text",true],["parent_id","دسته والد","category",false],["description","توضیحات","text",false],["is_active","وضعیت","active",false]],columns:[["name","نام"],["parent_name","دسته والد"],["is_active","وضعیت"]]},
 brands:{title:"برندها",fields:[["name","نام برند","text",true],["description","توضیحات","text",false],["is_active","وضعیت","active",false]],columns:[["name","نام برند"],["description","توضیحات"],["is_active","وضعیت"]]},
 warehouses:{title:"انبارها",fields:[["name","نام انبار","text",true],["code","کد انبار","text",true],["address","نشانی","text",false],["manager_name","مسئول انبار","text",false],["status","وضعیت","warehouse-status",false]],columns:[["name","نام"],["code","کد"],["manager_name","مسئول"],["status","وضعیت"]]},
 locations:{title:"موقعیت‌های انبار",fields:[["warehouse_id","انبار","warehouse",true],["code","کد موقعیت","text",true],["name","نام موقعیت","text",true],["zone","ناحیه","text",false],["shelf","قفسه","text",false],["capacity","ظرفیت","number",false],["status","وضعیت","status",false]],columns:[["warehouse_name","انبار"],["code","کد"],["name","موقعیت"],["zone","ناحیه"],["shelf","قفسه"],["status","وضعیت"]]}
};
const blank=(fields)=>Object.fromEntries(fields.map(([key,,type])=>[key,type==="active"?1:type==="status"||type==="warehouse-status"?"active":""]));
export default function MasterDataView({entity,onChanged=()=>{}}){
 const def=DEFINITIONS[entity], [items,setItems]=useState([]),[references,setReferences]=useState([]),[draft,setDraft]=useState(()=>blank(def.fields)),[editing,setEditing]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[reload,setReload]=useState(0);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await api.inventoryWorkspace(entity,{limit:100,offset:0});setItems(result.items||[]);if(entity==="locations")setReferences((await api.inventoryWorkspace("warehouses",{limit:100,offset:0})).items||[]);if(entity==="categories")setReferences((await api.inventoryWorkspace("categories",{limit:100,offset:0})).items||[]);}catch(e){setError(e.message||"دریافت اطلاعات ناموفق بود.");}finally{setLoading(false);}},[entity]);
 useEffect(()=>{load();},[load,reload]);
 const startEdit=(item)=>{setEditing(item.id);setDraft({...blank(def.fields),...item});};
 const reset=()=>{setEditing(null);setDraft(blank(def.fields));};
 const set=(key,value)=>setDraft(current=>({...current,[key]:value}));
 const submit=async(event)=>{event.preventDefault();setSaving(true);setError("");try{if(editing)await api.updateInventoryWorkspaceItem(entity,editing,{...draft,updated_at:draft.updated_at});else await api.createInventoryWorkspaceItem(entity,draft);reset();setReload(v=>v+1);onChanged();}catch(e){setError(e.message||"ذخیره اطلاعات ناموفق بود.");}finally{setSaving(false);}};
 const display=(key,value)=>key==="is_active"?(Number(value)===1?"فعال":"غیرفعال"):key==="status"?({active:"فعال",inactive:"غیرفعال",maintenance:"در حال تعمیر"}[value]||value||"—"):value??"—";
 const title=def.title;
 return <div className="iw-view">
  <div className="iw-intro"><div><span className="iw-eyebrow">LIVE D1 MASTER DATA</span><h2>{title}</h2><p>اطلاعات این صفحه مستقیماً از D1 خوانده و با API امن ذخیره می‌شود.</p></div><button className="iw-secondary" onClick={()=>setReload(v=>v+1)}><RefreshCw size={14}/> تازه‌سازی</button></div>
  <div className="iw-notice connected"><Database size={16}/> ثبت و ویرایش با کنترل دسترسی مدیران و ثبت سابقه تغییرات انجام می‌شود. حذف فیزیکی فعال نیست.</div>
  <form className="iw-master-form" onSubmit={submit}>
   <div className="iw-section-heading"><div><h3>{editing?"ویرایش رکورد":"افزودن رکورد جدید"}</h3><p>{editing?"تغییرات پس از ذخیره در سابقه ثبت می‌شوند.":"فیلدهای ضروری را تکمیل کنید."}</p></div></div>
   <div className="iw-master-fields">{def.fields.map(([key,label,type,required])=><label key={key}>{label}{type==="warehouse"||type==="category"||type==="active"||type==="status"||type==="warehouse-status"?<select required={required} value={draft[key]??""} onChange={e=>set(key,e.target.value)}>{type==="warehouse"&&<option value="">انتخاب انبار</option>}{type==="category"&&<><option value="">بدون دسته والد</option>{references.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</>}{type==="active"&&<><option value="1">فعال</option><option value="0">غیرفعال</option></>}{type==="status"&&<><option value="active">فعال</option><option value="inactive">غیرفعال</option></>}{type==="warehouse-status"&&<><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="maintenance">در حال تعمیر</option></>}{type==="warehouse"&&references.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>:<input type={type==="number"?"number":"text"} min={type==="number"?"0":undefined} required={required} value={draft[key]??""} onChange={e=>set(key,e.target.value)}/>}</label>)}</div>
   <div className="iw-master-actions"><button className="iw-primary" disabled={saving}><Save size={14}/>{saving?"در حال ذخیره...":editing?"ذخیره تغییرات":"ثبت اطلاعات"}</button>{editing&&<button type="button" className="iw-secondary" onClick={reset}><X size={14}/> انصراف</button>}</div>
  </form>
  {error&&<div className="iw-notice pending">{error}</div>}
  {loading?<div className="iw-empty"><RefreshCw className="iw-spin"/>در حال دریافت اطلاعات...</div>:items.length===0?<div className="iw-empty"><Database size={24}/><p>هنوز رکوردی ثبت نشده است.</p></div>:<div className="iw-table-wrap"><table className="iw-table"><thead><tr>{def.columns.map(([key,label])=><th key={key}>{label}</th>)}<th>عملیات</th></tr></thead><tbody>{items.map(item=><tr key={item.id}>{def.columns.map(([key])=><td key={key}>{display(key,item[key])}</td>)}<td><button className="iw-row-edit" onClick={()=>startEdit(item)}><Edit2 size={13}/> ویرایش</button></td></tr>)}</tbody></table></div>}
 </div>;
}
