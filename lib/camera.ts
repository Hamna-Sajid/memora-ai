// Opens the phone's rear camera and grabs one small (<=512px) photo.

export async function startCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, // rear camera on phones
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function capturePhoto(video: HTMLVideoElement): Promise<Blob> {
  const size = 512;
  const scale = Math.min(size / video.videoWidth, size / video.videoHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.9)
  );
}