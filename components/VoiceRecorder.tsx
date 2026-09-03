'use client';
import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/supabase/queries';

export default function VoiceRecorder({ onSaved }: { onSaved: (url: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunks.current = [];
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.onstop = async () => {
      const blob = new Blob(chunks.current, { type: 'audio/webm' });
      setPreviewUrl(URL.createObjectURL(blob));           // let the caregiver hear it
      setUploading(true);
      const url = await uploadFile('audio', blob, `note-${Date.now()}.webm`);
      setUploading(false);
      onSaved(url);                                        // hand the link back to the screen
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.current = mr;
    mr.start();
    setRecording(true);
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
    </div>
  );
}