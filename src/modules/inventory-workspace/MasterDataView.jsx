import React, { useCallback, useEffect, useState } from "react";
import { Database, Edit2, RefreshCw, Save, X } from "lucide-react";
import { api } from "../../lib/api/endpoints";

const DEFINITIONS = {
  categories: {
    title: "دسته‌بندی‌ها",
    fields: [
      ["name", "نام دسته‌بندی", "text", true],
      ["parent_id", "دسته والد", "category", false],
      ["description", "توضیحات", "text", false],
      ["is_active", "وضعیت", "active", false],
    ],
    columns: [["name", "نام"], ["parent_name", "دسته والد"], ["is_active", "وضعیت"]],
  },
  brands: {
    title: "برندها",
    fields: [
      ["name", "نام برند", "text", true],
      ["description", "توضیحات", "text", false],
      ["is_active", "وضعیت", "active", false],
    ],
    columns: [["name", "نام برند"], ["description", "توضیحات"], ["is_active", "وضعیت"]],
  },
  warehouses: {
    title: "انبارها",
    fields: [
      ["name", "نام انبار", "text", true],
      ["code", "کد انبار", "text", true],
      ["address", "نشانی", "text", false],
      ["manager_name", "مسئول انبار", "text", false],
      ["status", "وضعیت", "warehouse-status", false],
    ],
    columns: [["name", "نام"], ["code", "کد"], ["manager_name", "مسئول"], ["status", "وضعیت"]],
  },
  locations: {
    title: "موقعیت‌های انبار",
    fields: [
      ["warehouse_id", "انبار", "warehouse", true],
      ["code", "کد موقعیت", "text", true],
      ["name", "نام موقعیت", "text", true],
      ["zone", "ناحیه", "text", false],
      ["shelf", "قفسه", "text", false],
      ["capacity", "ظرفیت", "number", false],
      ["status", "وضعیت", "status", false],
    ],
    columns: [
      ["warehouse_name", "انبار"], ["code", "کد"], ["name", "موقعیت"],
      ["zone", "ناحیه"], ["shelf", "قفسه"], ["status", "وضعیت"],
    ],
  },
};

function emptyDraft(fields) {
  return Object.fromEntries(fields.map(([key, , type]) => [
    key,
    type === "active" ? 1 : (type === "status" || type === "warehouse-status" ? "active" : ""),
  ]));
}

function displayValue(key, value) {
  if (key === "is_active") return Number(value) === 1 ? "فعال" : "غیرفعال";
  if (key === "status") {
    return { active: "فعال", inactive: "غیرفعال", maintenance: "در حال تعمیر" }[value] || value || "—";
  }
  return value ?? "—";
}

export default function MasterDataView({ entity, onChanged = () => {} }) {
  const definition = DEFINITIONS[entity];
  const [items, setItems] = useState([]);
  const [references, setReferences] = useState([]);
  const [draft, setDraft] = useState(() => emptyDraft(definition.fields));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.inventoryWorkspace(entity, { limit: 100, offset: 0 });
      setItems(result.items || []);
      if (entity === "locations") {
        const warehouses = await api.inventoryWorkspace("warehouses", { limit: 100, offset: 0 });
        setReferences(warehouses.items || []);
      } else if (entity === "categories") {
        const categories = await api.inventoryWorkspace("categories", { limit: 100, offset: 0 });
        setReferences(categories.items || []);
      } else {
        setReferences([]);
      }
    } catch (requestError) {
      setError(requestError.message || "دریافت اطلاعات ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { load(); }, [load, reload]);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditing(null);
    setDraft(emptyDraft(definition.fields));
  }

  function editItem(item) {
    setEditing(item.id);
    setDraft({ ...emptyDraft(definition.fields), ...item });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.updateInventoryWorkspaceItem(entity, editing, {
          ...draft,
          updated_at: draft.updated_at,
        });
      } else {
        await api.createInventoryWorkspaceItem(entity, draft);
      }
      resetForm();
      setReload((value) => value + 1);
      onChanged();
    } catch (requestError) {
      setError(requestError.message || "ذخیره اطلاعات ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  function renderField([key, label, type, required]) {
    const common = {
      id: entity + "-" + key,
      required,
      value: draft[key] ?? "",
      onChange: (event) => setField(key, event.target.value),
    };

    let control;
    if (type === "warehouse" || type === "category" || type === "active" ||
        type === "status" || type === "warehouse-status") {
      control = (
        <select {...common}>
          {type === "warehouse" && <option value="">انتخاب انبار</option>}
          {type === "category" && <option value="">بدون دسته والد</option>}
          {type === "category" && references.filter((item) => item.id !== editing).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
          {type === "warehouse" && references.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
          {type === "active" && <>
            <option value="1">فعال</option>
            <option value="0">غیرفعال</option>
          </>}
          {(type === "status" || type === "warehouse-status") && <>
            <option value="active">فعال</option>
            <option value="inactive">غیرفعال</option>
            {type === "warehouse-status" && <option value="maintenance">در حال تعمیر</option>}
          </>}
        </select>
      );
    } else {
      control = (
        <input
          {...common}
          type={type === "number" ? "number" : "text"}
          min={type === "number" ? "0" : undefined}
        />
      );
    }

    return <label htmlFor={common.id} key={key}>{label}{control}</label>;
  }

  return (
    <div className="iw-view">
      <div className="iw-intro">
        <div>
          <span className="iw-eyebrow">LIVE D1 MASTER DATA</span>
          <h2>{definition.title}</h2>
          <p>اطلاعات این صفحه مستقیماً از D1 خوانده و با API امن ذخیره می‌شود.</p>
        </div>
        <button className="iw-secondary" type="button" onClick={() => setReload((value) => value + 1)}>
          <RefreshCw size={14}/> تازه‌سازی
        </button>
      </div>

      <div className="iw-notice connected">
        <Database size={16}/>
        ثبت و ویرایش با کنترل دسترسی مدیران و ثبت سابقه تغییرات انجام می‌شود. حذف فیزیکی فعال نیست.
      </div>

      <form className="iw-master-form" onSubmit={submit}>
        <div className="iw-section-heading">
          <div>
            <h3>{editing ? "ویرایش رکورد" : "افزودن رکورد جدید"}</h3>
            <p>{editing ? "تغییرات پس از ذخیره در سابقه ثبت می‌شوند." : "فیلدهای ضروری را تکمیل کنید."}</p>
          </div>
        </div>
        <div className="iw-master-fields">{definition.fields.map(renderField)}</div>
        <div className="iw-master-actions">
          <button className="iw-primary" disabled={saving}>
            <Save size={14}/>{saving ? "در حال ذخیره..." : editing ? "ذخیره تغییرات" : "ثبت اطلاعات"}
          </button>
          {editing && (
            <button type="button" className="iw-secondary" onClick={resetForm}>
              <X size={14}/> انصراف
            </button>
          )}
        </div>
      </form>

      {error && <div className="iw-notice pending">{error}</div>}

      {loading ? (
        <div className="iw-empty"><RefreshCw className="iw-spin"/>در حال دریافت اطلاعات...</div>
      ) : items.length === 0 ? (
        <div className="iw-empty"><Database size={24}/><p>هنوز رکوردی ثبت نشده است.</p></div>
      ) : (
        <div className="iw-table-wrap">
          <table className="iw-table">
            <thead><tr>{definition.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>عملیات</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {definition.columns.map(([key]) => <td key={key}>{displayValue(key, item[key])}</td>)}
                  <td>
                    <button className="iw-row-edit" type="button" onClick={() => editItem(item)}>
                      <Edit2 size={13}/> ویرایش
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
