import "client-only";

import type { User } from "@supabase/supabase-js";

import {
  requireSupabaseConfiguration,
  supabase,
} from "@/lib/supabase/client";

export async function currentUser(): Promise<User | null> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signUpCaregiver(
  displayName: string,
  email: string,
  password: string,
) {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function signInCaregiver(email: string, password: string) {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (data.user.is_anonymous) {
    await supabase.auth.signOut();
    throw new Error("A patient-device session cannot open caregiver mode.");
  }
  return data.user;
}

export async function signOut() {
  requireSupabaseConfiguration();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function createAnonymousDeviceUser(): Promise<User> {
  requireSupabaseConfiguration();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("The patient-device session was not created.");
  return data.user;
}
