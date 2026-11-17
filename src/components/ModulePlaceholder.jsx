export default function ModulePlaceholder({ title, description = "این بخش در ساختار پروژه تعریف شده و پس از اتصال API تکمیل می‌شود." }) {
  return <section className="panel empty-state">
    <div className="empty-icon">◈</div>
    <h2>{title}</h2>
    <p>{description}</p>
    <span className="status neutral">ساختار اولیه آماده است · اتصال داده در انتظار</span>
  </section>;
}
