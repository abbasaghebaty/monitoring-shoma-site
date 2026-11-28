export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);

const PERMISSIONS = Object.freeze({
  owner: Object.freeze({ read: ["*"], manage: ["*"] }),
  manager: Object.freeze({
    read: ["dashboard", "products", "productPrices", "inventory", "sales", "debts", "customers", "attendance", "reports", "inventoryWorkspace"],
    manage: ["products", "customers", "sales", "attendance", "inventoryWorkspace"],
  }),
  employee: Object.freeze({
    read: ["products", "inventory", "attendance"],
    manage: ["sales", "attendance"],
  }),
});

export function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function allows(role, action, resource) {
  const permissions = PERMISSIONS[role];
  if (!permissions || typeof resource !== "string") return false;
  const grants = permissions[action];
  return grants.includes("*") || grants.includes(resource);
}

export function canRead(role, resource = "dashboard") {
  return allows(role, "read", resource);
}

export function canManage(role, resource = "products") {
  return allows(role, "manage", resource);
}

export function canManageProducts(role) {
  return canManage(role, "products");
}
