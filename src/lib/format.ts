export function formatPrice(amount: number): string {
  const rounded = Math.round(amount);
  if (amount === rounded) {
    return `£${rounded}`;
  }
  return `£${amount.toFixed(2)}`;
}
