"use client";

import { useEffect, useRef, useState } from "react";

import { uploadFile } from "@/lib/supabase/queries";

export default function VoiceRecorder({ onSaved }: { onSaved: (url: string) => void }) {
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
          if (blob.size === 0) throw new Error("No audio was recorded.");
          setPreviewUrl(URL.createObjectURL(blob));
          setUploading(true);
          const url = await uploadFile("audio", blob, `note-${Date.now()}.webm`);
          onSaved(url);
        } catch {
          setError("The voice note could not be uploaded. Please try again.");
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

  return (
    <div>
      {!recording ? (
        <button type="button" onClick={start}>🎙️ Record note</button>
      ) : (
        <button type="button" onClick={stop}>⏹️ Stop</button>
      )}
      {uploading && <span> uploading…</span>}
      {previewUrl && <audio src={previewUrl} controls />}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
