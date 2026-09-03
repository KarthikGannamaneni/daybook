/** +919876543210 -> +91 98xxx xx210 (§6.4: never show another member's full number). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 8) return phone;
  const cc = digits.slice(0, digits.length - 10) || '';
  const rest = digits.slice(-10);
  return `+${cc} ${rest.slice(0, 2)}xxx xx${rest.slice(-3)}`;
}
