// Human-readable numbers.

export function fmtPop(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return `${Math.round(n)}`;
}

export function fmtMoney(n) {
  if (n >= 1e15) return `$${(n / 1e15).toFixed(1)} qd`;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)} tn`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)} bn`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)} m`;
  return `$${Math.round(n / 1e3)} k`;
}
