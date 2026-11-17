// Map this repository only after inspecting the real D1 schema and indexes.
export async function listProducts(db, options = {}) {
  if (!db) throw new Error("D1 binding DB is missing");
  throw new Error("Products repository is not mapped to the live schema yet");
}
