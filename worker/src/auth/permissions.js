export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
export function isValidRole(role) { return VALID_ROLES.includes(role); }

// Every authenticated, active role may read the site's registered resources.
// Sensitive write operations remain restricted to owner/manager.
export function canRead(role) {
  return isValidRole(role);
}

export function canManage(role) { return role === "owner" || role === "manager"; }
