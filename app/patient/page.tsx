"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { recallFromDatabase } from "@/lib/ai/database-recall";
import {
  isConfirmedBy,
  requiresConfirmation,
} from "@/lib/ai/confirmation";
import { warmEmbeddingModel } from "@/lib/ai/embeddings";
import type { RecallItem } from "@/lib/ai/types";
import { capturePhoto, startCamera } from "@/lib/camera";
import { caregiverPhoneHref } from "@/lib/caregiver-contact";
import { getActivePatientId } from "@/lib/patient-context";
import { currentUser } from "@/lib/supabase/auth";
import {
  getAccessiblePatient,
  getPairedPatient,
  type Patient,
} from "@/lib/supabase/patients";

type DescriptionResponse = {
  description?: unknown;
  source?: unknown;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function describeUnknownPhoto(photo: Blob): Promise<string | null> {
  try {
    const response = await fetch("/api/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: await blobToDataUrl(photo) }),
    });
    const body = (await response.json()) as DescriptionResponse;
    return body.source === "qwen" && typeof body.description === "string"
      ? body.description
      : null;
  } catch {
    return null;
  }
}

export default function PatientPage() {
  const caregiverPhone = caregiverPhoneHref(
    process.env.NEXT_PUBLIC_CAREGIVER_PHONE,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Checking patient access…");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [caregiverPreview, setCaregiverPreview] = useState(false);
  const [result, setResult] = useState<RecallItem | null>(null);
  const [notSure, setNotSure] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const user = await currentUser();
      if (!active) return;
      if (!user) {
        setStatus("This device is not paired with a patient.");
        setAccessReady(true);
        return;
      }

      const accessiblePatient = user.is_anonymous
        ? await getPairedPatient(user)
        : await (async () => {
            const patientId = getActivePatientId();
            return patientId ? getAccessiblePatient(patientId) : null;
          })();
      if (!active) return;
      setCaregiverPreview(!user.is_anonymous);
      setPatient(accessiblePatient);
      setAccessReady(true);
      if (!accessiblePatient) {
        setStatus(
          user.is_anonymous
            ? "This patient-device pairing is missing or revoked."
            : "Select a patient from caregiver mode first.",
        );
      }
    })().catch((error: unknown) => {
      if (!active) return;
      setStatus(error instanceof Error ? error.message : "Patient access could not be checked.");
      setAccessReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!patient) return;
    let active = true;
    let stream: MediaStream | null = null;

    void (async () => {
      const cameraPromise = videoRef.current
        ? startCamera(videoRef.current)
        : Promise.reject(new Error("Camera element unavailable."));
      const [modelResult, cameraResult] = await Promise.allSettled([
        warmEmbeddingModel(),
        cameraPromise,
      ]);

      if (!active) {
        if (cameraResult.status === "fulfilled") {
          cameraResult.value.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      if (cameraResult.status === "fulfilled") {
        stream = cameraResult.value;
        setCameraReady(true);
      }

      if (modelResult.status === "rejected") {
        setStatus("Recognition model unavailable — reload to retry.");
      } else if (cameraResult.status === "fulfilled") {
        setStatus("Ready. Point the camera and tap once.");
      } else {
        setStatus("Ready. Choose a query image from this computer.");
      }
    })();

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [patient]);

  async function recognisePhoto(
    photo: Blob,
    captureConfirmation?: () => Promise<Blob>,
  ) {
    if (!patient) return;
    setBusy(true);
    setResult(null);
    setNotSure(false);
    setDescription(null);
    setStatus("Looking…");

    try {
      const recalled = await recallFromDatabase(photo, patient.id);

      if (recalled.notSure) {
        setNotSure(true);
        setStatus("Checking the photo…");
        setDescription(await describeUnknownPhoto(photo));
        setStatus("I’m not sure. You can ask your caregiver.");
      } else if (requiresConfirmation(recalled)) {
        if (!captureConfirmation) {
          setNotSure(true);
          setStatus("This result needs a second camera check. Please try again.");
          return;
        }

        setStatus("Hold steady — checking once more…");
        const confirmationPhoto = await captureConfirmation();
        const confirmation = await recallFromDatabase(confirmationPhoto, patient.id);

        if (!isConfirmedBy(recalled, confirmation)) {
          setNotSure(true);
          setStatus("I’m not sure. You can ask your caregiver.");
          return;
        }

        setResult(recalled.item);
        setStatus("Recognised after a second check.");
        if (recalled.item.audioUrl) {
          await new Audio(recalled.item.audioUrl).play().catch(() => undefined);
        }
      } else {
        setResult(recalled.item);
        setStatus("Recognised.");
        if (recalled.item.audioUrl) {
          await new Audio(recalled.item.audioUrl).play().catch(() => undefined);
        }
      }
    } catch {
      setNotSure(true);
      setStatus("I couldn’t check that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onTap() {
    if (busy || !cameraReady || !videoRef.current) return;
    try {
      await recognisePhoto(
        await capturePhoto(videoRef.current),
        async () => {
          if (!videoRef.current) {
            throw new Error("Camera element unavailable.");
          }
          return capturePhoto(videoRef.current);
        },
      );
    } catch {
      setNotSure(true);
      setStatus("The camera is not ready. Choose an image file instead.");
    }
  }

  async function chooseQueryImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    await recognisePhoto(file);
  }

  if (!accessReady) {
    return <main className="app"><p className="status">{status}</p></main>;
  }

  if (!patient) {
    return (
      <main className="app">
        <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
          <h2>Patient device not ready</h2>
          <p className="alert">{status}</p>
          {caregiverPreview ? (
            <Link className="btn primary" href="/caregiver">Select patient</Link>
          ) : (
            <p className="muted">Ask a caregiver to create a pairing link and open it on this device.</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="phone">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Memora · {patient.displayName}</strong>
          {caregiverPreview && <Link className="btn" href="/caregiver">Setup</Link>}
        </div>

        <div className="camera"><video ref={videoRef} playsInline muted /></div>

        <p className="status" aria-live="polite">{status}</p>

        <button className="primary big-question" onClick={onTap} disabled={busy || !cameraReady}>
          <span>{busy ? "Please wait…" : cameraReady ? "What is this?" : "Camera unavailable"}</span>
          <span className="urdu">یہ کیا ہے؟</span>
        </button>

        <label>
          Or choose a query image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={chooseQueryImage}
            disabled={busy}
          />
        </label>

        <div className="result" aria-live="polite">
          {!result && !notSure && (
            <>
              <strong>Ready</strong>
              <p>Point the phone and tap once.</p>
              <p className="urdu">فون سامنے کریں اور ایک بار دبائیں۔</p>
            </>
          )}
          {notSure && (
            <>
              <strong>I&apos;m not sure.</strong>
              {description && <p>{description}</p>}
              <p>Shall I call your caregiver?</p>
              {caregiverPhone ? (
                <a className="btn primary" href={caregiverPhone}>Call caregiver</a>
              ) : (
                <p className="muted">Caregiver phone number is not configured.</p>
              )}
            </>
          )}
          {result && (
            <>
              <strong>{result.label}</strong>
              <p>{result.noteText}</p>
              <small>Playing caregiver voice…</small>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
