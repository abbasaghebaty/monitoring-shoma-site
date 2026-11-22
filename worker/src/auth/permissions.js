export function canRead(role, resource) {
  if (role === "owner" || role === "manager") return true;
  if (role === "employee") return resource === "attendance";
  return false;
}

// Product writes are restricted to the two administrative roles.
// Employee access remains read-only and limited to personal attendance.
export function canManage(role) {
  return role === "owner" || role === "manager";
}
