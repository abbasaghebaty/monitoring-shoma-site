export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
export function isValidRole(role) { return VALID_ROLES.includes(role); }
export function canRead(role, resource) {
  if (role === "owner" || role === "manager") return true;
  if (role === "employee") return resource === "attendance";
  return false;
}
export function canManage(role) { return role === "owner" || role === "manager"; }
