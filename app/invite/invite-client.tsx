"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { setActivePatientId } from "@/lib/patient-context";
import { currentUser } from "@/lib/supabase/auth";
import { acceptCaregiverInvitation } from "@/lib/supabase/patients";

export const PENDING_INVITATION_KEY = "memora.pendingCaregiverInvitation";

export default function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const attempt = useRef<Promise<Awaited<ReturnType<typeof acceptInvite>>> | null>(null);
  const [status, setStatus] = useState("Checking caregiver invitation…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    attempt.current ??= acceptInvite(token);
    void attempt.current.then((patient) => {
      if (!active || !patient) return;
      localStorage.removeItem(PENDING_INVITATION_KEY);
      setActivePatientId(patient.id);
      setStatus(`Access granted for ${patient.displayName}. Opening caregiver mode…`);
      router.replace("/caregiver");
    }).catch((error: unknown) => {
      if (!active) return;
      setFailed(true);
      setStatus(errorMessage(error, "Invitation could not be accepted."));
    });
    return () => { active = false; };
  }, [router, token]);

  return (
    <main className="app">
      <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <h2>Caregiver invitation</h2>
        <p className={failed ? "alert" : "status"} aria-live="polite">{status}</p>
        {failed && <Link className="btn" href="/auth">Open caregiver sign in</Link>}
      </div>
    </main>
  );
}

async function acceptInvite(token: string) {
  if (!token) throw new Error("This invitation link is incomplete.");
  const user = await currentUser();
  if (!user || user.is_anonymous) {
    localStorage.setItem(PENDING_INVITATION_KEY, token);
    window.location.replace("/auth");
    return null;
  }
  return acceptCaregiverInvitation(token);
}

function errorMessage(error: unknown, fallback: string) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : fallback;
}
