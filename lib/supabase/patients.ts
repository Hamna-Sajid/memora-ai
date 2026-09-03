import "client-only";

import type { User } from "@supabase/supabase-js";

import {
  requireSupabaseConfiguration,
  supabase,
} from "@/lib/supabase/client";

export type Patient = {
  id: string;
  displayName: string;
  preferredLanguage: "en" | "ur";
};

export type PatientDevice = {
  id: string;
  label: string;
  pairedAt: string;
  revokedAt: string | null;
};

export type CaregiverMember = {
  id: string;
  displayName: string;
  role: "owner" | "editor" | "viewer";
};

type PatientRow = {
  id?: unknown;
  display_name?: unknown;
  preferred_language?: unknown;
};

function mapPatient(row: PatientRow): Patient {
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new TypeError("Patient record has an invalid id.");
  }
  if (typeof row.display_name !== "string" || !row.display_name.trim()) {
    throw new TypeError("Patient record has an invalid display name.");
  }
  if (row.preferred_language !== "en" && row.preferred_language !== "ur") {
    throw new TypeError("Patient record has an invalid language.");
  }
  return {
    id: row.id,
    displayName: row.display_name,
    preferredLanguage: row.preferred_language,
  };
}

export async function listAccessiblePatients(): Promise<Patient[]> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("patients")
    .select("id, display_name, preferred_language")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapPatient(row as PatientRow));
}

export async function getCaregiverRole(
  patientId: string,
  caregiverId: string,
): Promise<CaregiverMember["role"] | null> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("caregiver_patient_memberships")
    .select("role")
    .eq("patient_id", patientId)
    .eq("caregiver_id", caregiverId)
    .maybeSingle();
  if (error) throw error;
  return data && ["owner", "editor", "viewer"].includes(data.role)
    ? data.role as CaregiverMember["role"]
    : null;
}

export async function getAccessiblePatient(
  patientId: string,
): Promise<Patient | null> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("patients")
    .select("id, display_name, preferred_language")
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPatient(data as PatientRow) : null;
}

export async function createPatient(
  name: string,
  language: "en" | "ur",
): Promise<Patient> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("create_patient", {
    patient_name: name.trim(),
    patient_language: language,
  });
  if (error) throw error;
  return mapPatient(data as PatientRow);
}

export async function createPairingToken(patientId: string) {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("create_pairing_code", {
    target_patient_id: patientId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row ||
    typeof row.token !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    throw new TypeError("Pairing service returned an invalid response.");
  }
  return { token: row.token, expiresAt: row.expires_at };
}

export async function claimPatientDevice(
  token: string,
  deviceLabel: string,
): Promise<Patient> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("claim_patient_device", {
    pairing_token: token,
    device_label: deviceLabel,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row ||
    typeof row.patient_id !== "string" ||
    typeof row.patient_name !== "string" ||
    (row.patient_language !== "en" && row.patient_language !== "ur")
  ) {
    throw new TypeError("Pairing service returned an invalid patient.");
  }
  return {
    id: row.patient_id,
    displayName: row.patient_name,
    preferredLanguage: row.patient_language,
  };
}

export async function getPairedPatient(user: User): Promise<Patient | null> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("patient_devices")
    .select("patient_id")
    .eq("auth_user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || typeof data.patient_id !== "string") return null;
  return getAccessiblePatient(data.patient_id);
}

export async function listPatientDevices(
  patientId: string,
): Promise<PatientDevice[]> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("patient_devices")
    .select("id, label, paired_at, revoked_at")
    .eq("patient_id", patientId)
    .order("paired_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    pairedAt: String(row.paired_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  }));
}

export async function revokePatientDevice(deviceId: string) {
  requireSupabaseConfiguration();
  const { error } = await supabase
    .from("patient_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (error) throw error;
}

export async function createCaregiverInvitation(
  patientId: string,
  email: string,
  role: "editor" | "viewer",
) {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("create_caregiver_invitation", {
    target_patient_id: patientId,
    caregiver_email: email.trim(),
    caregiver_role: role,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.token !== "string" || typeof row.expires_at !== "string") {
    throw new TypeError("Invitation service returned an invalid response.");
  }
  return { token: row.token, expiresAt: row.expires_at };
}

export async function acceptCaregiverInvitation(token: string): Promise<Patient> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("accept_caregiver_invitation", {
    invitation_token: token,
  });
  if (error) throw error;
  return mapPatient(data as PatientRow);
}

export async function listPatientCaregivers(
  patientId: string,
): Promise<CaregiverMember[]> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.rpc("list_patient_caregivers", {
    target_patient_id: patientId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => {
    if (
      typeof row.caregiver_id !== "string" ||
      typeof row.display_name !== "string" ||
      !["owner", "editor", "viewer"].includes(row.role)
    ) {
      throw new TypeError("Caregiver membership has an invalid response.");
    }
    return {
      id: row.caregiver_id,
      displayName: row.display_name,
      role: row.role as CaregiverMember["role"],
    };
  });
}

async function removePatientMedia(bucket: "photos" | "audio", patientId: string) {
  const storage = supabase.storage.from(bucket);
  const paths: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await storage.list(patientId, { limit: 100, offset });
    if (error) throw error;
    const files = (data ?? []).filter((entry) => entry.id !== null);
    paths.push(...files.map((entry) => `${patientId}/${entry.name}`));
    if ((data ?? []).length < 100) break;
    offset += 100;
  }
  if (paths.length > 0) {
    const { error } = await storage.remove(paths);
    if (error) throw error;
  }
}

export async function deletePatient(patientId: string) {
  requireSupabaseConfiguration();
  await Promise.all([
    removePatientMedia("photos", patientId),
    removePatientMedia("audio", patientId),
  ]);
  const { data, error } = await supabase.rpc("delete_patient", {
    target_patient_id: patientId,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Patient profile was not deleted.");
}
