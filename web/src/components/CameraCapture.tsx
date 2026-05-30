"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    setError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError("无法打开摄像头，请检查权限设置");
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [facingMode, startCamera, capturedUrl]);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedBlob(null);
    setCapturedUrl(null);
  }

  function handleConfirm() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onCapture(file);
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-black">
      {error ? (
        <div className="flex h-80 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-sm text-red-400">{error}</div>
          <button
            className="rounded-full bg-zinc-800 px-5 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
            onClick={() => startCamera(facingMode)}
          >
            重试
          </button>
        </div>
      ) : capturedUrl ? (
        <div className="relative">
          <img src={capturedUrl} alt="captured" className="h-80 w-full object-contain" />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
            <button
              className="rounded-full bg-zinc-800/80 px-5 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-700/80"
              onClick={handleRetake}
            >
              重拍
            </button>
            <button
              className="rounded-full bg-zinc-50 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
              onClick={handleConfirm}
            >
              确认使用
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-80 w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
            <button
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-zinc-400/60 text-zinc-100 transition-colors hover:border-zinc-100"
              onClick={toggleCamera}
              title="翻转摄像头"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              className="grid h-14 w-14 place-items-center rounded-full border-4 border-zinc-100 text-zinc-100 transition-transform hover:scale-105 active:scale-95"
              onClick={handleCapture}
              title="拍照"
            >
              <div className="h-10 w-10 rounded-full bg-zinc-100" />
            </button>
            <button
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-zinc-400/60 text-zinc-100 transition-colors hover:border-zinc-100"
              onClick={onClose}
              title="取消"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
