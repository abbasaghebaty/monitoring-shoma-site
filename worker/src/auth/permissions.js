export function canRead(role, resource) {
  if (role === "owner" || role === "manager") return true;
  if (role === "employee") return resource === "attendance";
  return false;
}
