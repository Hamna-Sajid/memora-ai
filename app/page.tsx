"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getActivePatientId } from "@/lib/patient-context";
import { currentUser } from "@/lib/supabase/auth";

type HomeSession = "loading" | "signed-out" | "caregiver" | "patient-device";

export default function Home() {
  const [session, setSession] = useState<HomeSession>("loading");
  const [hasSelectedPatient, setHasSelectedPatient] = useState(false);

  useEffect(() => {
    let active = true;
    void currentUser().then((user) => {
      if (!active) return;
      setHasSelectedPatient(Boolean(getActivePatientId()));
      setSession(
        !user ? "signed-out" : user.is_anonymous ? "patient-device" : "caregiver",
      );
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
      </header>

      <h1>A familiar voice when memory needs help.</h1>
      <p className="lead">
        A caregiver enrolls meaningful objects and medicines so the patient
        can tap once and hear the answer in a trusted voice.
      </p>

      {session === "loading" ? (
        <p className="status" style={{ marginTop: 24 }}>Checking this device…</p>
      ) : (
        <div className="mode-grid" style={{ marginTop: 24, maxWidth: 640 }}>
          {session === "patient-device" ? (
            <Link className="btn mode-card primary" href="/patient">
              <span><strong>Show me</strong>
                <span className="urdu">مجھے دکھائیں</span></span>
              <span>This paired device opens directly into patient recognition.</span>
            </Link>
          ) : session === "caregiver" ? (
            <>
              <Link className="btn mode-card" href="/caregiver">
                <span><strong>Caregiver dashboard</strong></span>
                <span className="muted">Manage patients, enrollment, devices, and caregiver access.</span>
              </Link>
              <Link className="btn mode-card" href={hasSelectedPatient ? "/patient" : "/caregiver"}>
                <span><strong>Preview patient mode</strong></span>
                <span className="muted">
                  {hasSelectedPatient
                    ? "Preview recognition for the currently selected patient."
                    : "Select a patient in the caregiver dashboard first."}
                </span>
              </Link>
            </>
          ) : (
            <>
              <Link className="btn mode-card" href="/auth">
                <span><strong>Caregiver sign in</strong>
                  <span className="urdu">میں دیکھ بھال کرنے والا ہوں</span></span>
                <span className="muted">Sign in to manage patients, consent, items, and voice notes.</span>
              </Link>
              <div className="card mode-card">
                <span><strong>Patient device</strong>
                  <span className="urdu">مریض کا آلہ</span></span>
                <span className="muted">Open the temporary pairing link supplied by a caregiver.</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="trust">
        <span className="chip">Camera → CLIP 512</span>
        <span className="chip">Supabase pgvector</span>
        <span className="chip">Caregiver voice</span>
        <span className="chip">Safe not-sure response</span>
      </div>
    </main>
  );
}
