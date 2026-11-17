export default function ModulePlaceholder({ title, description = "این بخش در ساختار پروژه تعریف شده است و پس از اتصال داده و تکمیل عملیات فعال می‌شود." }) {
  return <section className="panel empty-state">
    <div className="empty-icon">◈</div>
    <h2>{title}</h2>
    <p>{description}</p>
  </section>;
}
