export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export function randomOtp() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1000000).padStart(6, "0");
}
