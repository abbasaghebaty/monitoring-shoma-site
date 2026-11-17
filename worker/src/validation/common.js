export function parsePagination(url, { maxLimit = 100 } = {}) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), maxLimit);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new Error("Invalid pagination parameters");
  return { limit, offset };
}
