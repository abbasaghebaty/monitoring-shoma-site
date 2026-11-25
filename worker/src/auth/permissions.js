export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
export function isValidRole(role) { return VALID_ROLES.includes(role); }

// Roles identify the account at login; they do not grant different site permissions.
export function canRead(role) {
  return isValidRole(role);
}

export function canManage(role) { return isValidRole(role); }
