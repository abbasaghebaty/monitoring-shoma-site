export function formatWorkspaceNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(Number(value || 0));
}

export function formatWorkspaceMoney(value) {
  return formatWorkspaceNumber(value) + " تومان";
}

export function getWorkspaceStatus(status) {
  if (status === "connected") return { label: "متصل به داده واقعی", tone: "connected" };
  return { label: "ساختار اولیه · اتصال بعدی", tone: "scaffold" };
}

export function groupWorkspaceModules(modules, groups) {
  return groups.map((group) => ({
    group,
    items: modules.filter((item) => item.group === group),
  })).filter((item) => item.items.length);
}
