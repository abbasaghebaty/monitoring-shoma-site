export const VALID_ROLES = Object.freeze(["owner", "manager", "employee"]);
export function isKnownRole(role) { return VALID_ROLES.includes(role); }

// All authenticated roles can open every site section; API permissions remain enforced by the Worker.
export function getInitialPage(role) {
  return isKnownRole(role) ? "dashboard" : null;
}

export function getVisibleNavigation(role, navigation) {
  return isKnownRole(role) ? navigation : [];
}
