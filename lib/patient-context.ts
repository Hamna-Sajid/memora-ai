import "client-only";

const ACTIVE_PATIENT_KEY = "memora.activePatientId";

export function getActivePatientId(): string | null {
  return window.localStorage.getItem(ACTIVE_PATIENT_KEY);
}

export function setActivePatientId(patientId: string) {
  window.localStorage.setItem(ACTIVE_PATIENT_KEY, patientId);
}

export function clearActivePatientId() {
  window.localStorage.removeItem(ACTIVE_PATIENT_KEY);
}
