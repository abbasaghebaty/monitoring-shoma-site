export function parsePagination(url, { maxLimit = 100 } = {}) {
  const rawLimit = url.searchParams.get("limit") || "50";
  const rawOffset = url.searchParams.get("offset") || "0";
  const parsedLimit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : 50;
  const parsedOffset = /^\d+$/.test(rawOffset) ? Number(rawOffset) : 0;
  return {
    limit: Math.min(Math.max(parsedLimit, 1), maxLimit),
    offset: Math.min(Math.max(parsedOffset, 0), 1000000),
  };
}
export function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}
