export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
const NAVIGATION_ACCESS = Object.freeze({
  dashboard: ["owner", "manager"],
  products: ["owner", "manager", "employee"],
  inventory: ["owner", "manager", "employee"],
  sales: ["owner", "manager"],
  debts: ["owner", "manager"],
  customers: ["owner", "manager"],
  attendance: ["owner", "manager", "employee"],
  reports: ["owner", "manager"],
  "inventory-workspace": ["owner", "manager"],
});
export function isKnownRole(role) { return VALID_ROLES.includes(role); }
export function canManageProducts(role) { return role === "owner" || role === "manager"; }
export function getInitialPage(role) {
  if (!isKnownRole(role)) return null;
  return role === "employee" ? "attendance" : "dashboard";
}
export function getVisibleNavigation(role, navigation) {
  if (!isKnownRole(role)) return [];
  return navigation.filter(([, key]) => (NAVIGATION_ACCESS[key] || []).includes(role));
}
