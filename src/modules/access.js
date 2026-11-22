export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
export function isKnownRole(role) { return VALID_ROLES.includes(role); }
export function getInitialPage(role) {
  if (role === "employee") return "attendance";
  if (role === "owner" || role === "manager") return "dashboard";
  return null;
}
export function getVisibleNavigation(role, navigation) {
  if (!isKnownRole(role)) return [];
  if (role === "employee") return navigation.filter(([, key]) => key === "attendance");
  return navigation;
}
