"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { recallFromDatabase } from "@/lib/ai/database-recall";
import { warmEmbeddingModel } from "@/lib/ai/embeddings";
import type { RecallItem } from "@/lib/ai/types";
import { capturePhoto, startCamera } from "@/lib/camera";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Loading recognition model…");
  const [result, setResult] = useState<RecallItem | null>(null);
  const [notSure, setNotSure] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    void (async () => {
      try {
        if (!videoRef.current) return;
        stream = await startCamera(videoRef.current);
      } catch {
        if (active) setStatus("Camera blocked — allow camera access and reload.");
        return;
      }

      try {
        await warmEmbeddingModel();
        if (active) setStatus("Ready. Point the camera and tap once.");
      } catch {
        if (active) setStatus("Recognition model unavailable — reload to retry.");
      }
    })();

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function onTap() {
    if (busy || !videoRef.current) return;

    setBusy(true);
    setResult(null);
    setNotSure(false);
    setDescription(null);
    setStatus("Looking…");

    try {
      const photo = await capturePhoto(videoRef.current);
      const recalled = await recallFromDatabase(photo);

      if (recalled.notSure) {
        setNotSure(true);
        setStatus("Checking the photo…");
        setDescription(await describeUnknownPhoto(photo));
        setStatus("I’m not sure. You can ask your caregiver.");
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

  return (
    <main className="app">
      <div className="phone">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Memora</strong>
          <Link className="btn" href="/caregiver">Setup</Link>
        </div>

        <div className="camera"><video ref={videoRef} playsInline muted /></div>

        <p className="status" aria-live="polite">{status}</p>

        <button className="primary big-question" onClick={onTap} disabled={busy}>
          <span>{busy ? "Please wait…" : "What is this?"}</span>
          <span className="urdu">یہ کیا ہے؟</span>
        </button>

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
              <a className="btn primary" href="tel:+920000000000">Call caregiver</a>
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
