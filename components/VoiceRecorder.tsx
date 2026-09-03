"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { uploadFile } from "@/lib/supabase/queries";

export default function VoiceRecorder({
  patientId,
  onSaved,
}: {
  patientId: string;
  onSaved: (url: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function uploadAudio(blob: Blob, extension = ".webm") {
    if (blob.size === 0) throw new Error("No audio was provided.");
    setPreviewUrl(URL.createObjectURL(blob));
    setUploading(true);
    const url = await uploadFile(
      "audio",
      blob,
      `note-${Date.now()}${extension}`,
      patientId,
    );
    onSaved(url);
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks.current, { type: "audio/webm" });
          await uploadAudio(blob);
        } catch (uploadError: unknown) {
          setError(
            uploadError instanceof Error
              ? uploadError.message
              : "The voice note could not be uploaded. Please try again.",
          );
        } finally {
          setUploading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError("Microphone blocked — allow access and try again.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  async function chooseAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    const extension = /\.[a-z0-9]{1,5}$/i.exec(file.name)?.[0] || ".webm";
    try {
      await uploadAudio(file, extension);
    } catch (uploadError: unknown) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The audio file could not be uploaded. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {!recording ? (
        <button type="button" onClick={start}>🎙️ Record note</button>
      ) : (
        <button type="button" onClick={stop}>⏹️ Stop</button>
      )}
      {uploading && <span> uploading…</span>}
      {previewUrl && <audio src={previewUrl} controls />}
      <label style={{ marginTop: 12 }}>
        Or choose an existing audio file
        <input type="file" accept="audio/*" onChange={chooseAudio} disabled={uploading} />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
