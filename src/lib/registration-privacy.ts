// Change this version whenever the notice's purposes or retention terms change.
export const REGISTRATION_PRIVACY_VERSION = "2026-10-19.1";
export const DATA_PRIVACY_ACT_URL = "https://privacy.gov.ph/data-privacy-act/";
export const REGISTRATION_PRIVACY_CONTACT_EMAIL = "ggonzales.k12254495@umak.edu.ph";

export type RegistrationPrivacyConsent = {
  version: typeof REGISTRATION_PRIVACY_VERSION;
  accepted: true;
};

export function hasRegistrationPrivacyConsent(value: unknown): value is RegistrationPrivacyConsent {
  if (!value || typeof value !== "object") return false;
  const consent = value as Record<string, unknown>;
  return consent.accepted === true && consent.version === REGISTRATION_PRIVACY_VERSION;
}
