"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  currentUser,
  signInCaregiver,
  signUpCaregiver,
} from "@/lib/supabase/auth";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Checking session…");
  const [busy, setBusy] = useState(false);

  function caregiverDestination() {
    const token = localStorage.getItem("memora.pendingCaregiverInvitation");
    return token ? `/invite?token=${encodeURIComponent(token)}` : "/caregiver";
  }

  useEffect(() => {
    let active = true;
    void currentUser().then((user) => {
      if (!active) return;
      if (user && !user.is_anonymous) {
        router.replace(caregiverDestination());
      } else {
        setStatus("");
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && displayName.trim().length < 2) {
      setStatus("Enter the caregiver's name.");
      return;
    }
    if (!email.trim() || password.length < 8) {
      setStatus("Enter a valid email and a password of at least 8 characters.");
      return;
    }

    setBusy(true);
    setStatus(mode === "signin" ? "Signing in…" : "Creating account…");
    try {
      if (mode === "signin") {
        await signInCaregiver(email, password);
        router.replace("/caregiver");
      } else {
        const data = await signUpCaregiver(displayName, email, password);
        if (data.session) {
          router.replace(caregiverDestination());
        } else {
          setStatus("Account created. Check your email, then sign in.");
          setMode("signin");
        }
      }
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">M</span><span>Memora Ai</span></div>
        <Link className="btn" href="/">Home</Link>
      </header>

      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h2>{mode === "signin" ? "Caregiver sign in" : "Create caregiver account"}</h2>
        <p className="muted">Patients use a paired device and do not need to remember a password.</p>
        <form className="stack" onSubmit={submit}>
          {mode === "signup" && (
            <label>Caregiver name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label>Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </label>
          {status && <div className={status.includes("created") ? "success" : "alert"}>{status}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          style={{ marginTop: 12 }}
          onClick={() => {
            setMode((current) => current === "signin" ? "signup" : "signin");
            setStatus("");
          }}
          disabled={busy}
        >
          {mode === "signin" ? "Create a caregiver account" : "I already have an account"}
        </button>
      </div>
    </main>
  );
}
