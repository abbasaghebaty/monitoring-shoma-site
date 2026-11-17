export function parsePagination(url, { maxLimit = 100 } = {}) {
  const rawLimit = url.searchParams.get("limit") || "50";
  const rawOffset = url.searchParams.get("offset") || "0";
  if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) throw new Error("Invalid pagination parameters");
  const limit = Math.min(Math.max(Number(rawLimit), 1), maxLimit);
  const offset = Math.min(Number(rawOffset), 1000000);
  return { limit, offset };
}
export function validIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
