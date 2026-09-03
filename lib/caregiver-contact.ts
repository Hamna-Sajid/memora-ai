export function caregiverPhoneHref(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/[\s()-]/g, "") ?? "";
  if (normalized === "+920000000000") return null;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? `tel:${normalized}` : null;
}
