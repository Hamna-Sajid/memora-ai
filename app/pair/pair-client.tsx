"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  createAnonymousDeviceUser,
  currentUser,
} from "@/lib/supabase/auth";
import { claimPatientDevice } from "@/lib/supabase/patients";
import { setActivePatientId } from "@/lib/patient-context";

export default function PairClient({ token }: { token: string }) {
  const router = useRouter();
  const pairingAttempt = useRef<ReturnType<typeof pairDevice> | null>(null);
  const [status, setStatus] = useState("Preparing this patient device…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    pairingAttempt.current ??= pairDevice(token);
    void pairingAttempt.current
      .then((patient) => {
        if (!active) return;
        setActivePatientId(patient.id);
        setStatus(`Paired for ${patient.displayName}. Opening patient mode…`);
        router.replace("/patient");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : "Pairing failed.";
        setFailed(true);
        setStatus(message);
      });

    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <main className="app">
      <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <h2>Pair patient device</h2>
        <p className={failed ? "alert" : "status"} aria-live="polite">{status}</p>
        {failed && <Link className="btn" href="/">Return home</Link>}
      </div>
    </main>
  );
}

async function pairDevice(token: string) {
  if (!token) throw new Error("This pairing link is incomplete.");
  const existing = await currentUser();
  if (existing && !existing.is_anonymous) {
    throw new Error(
      "This browser is signed in as a caregiver. Open the link on the patient's device or in a separate browser profile.",
    );
  }

  const deviceUser = existing ?? await createAnonymousDeviceUser();
  if (!deviceUser.is_anonymous) {
    throw new Error("A restricted patient-device session is required.");
  }
  return claimPatientDevice(token, "Patient browser");
}
