"use client";

import { createLogger } from "@/lib/logger";
import {
  createLocalFaceCaptureProcessor,
  type LocalFaceCaptureProcessor,
} from "@/lib/privacy/local-face-analysis";
import type { FaceMatchStatus } from "@/lib/privacy/face-matching";
import {
    getStoredCameraStream,
    getStoredScreenStream,
    setStoredCameraStream,
    setStoredScreenStream,
    wasCameraSkipped,
    wasScreenSkipped,
} from "@/lib/media-stream-store";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("recording");

export interface ScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
  faceMatch?: FaceMatchStatus;
}

interface UseInterviewRecordingOptions {
  sessionId: string;
  enabled: boolean;
  screenshotIntervalMs?: number;
}

/**
 * Manages camera/screen streams and periodic screenshot capture during a
 * voice interview. Microphone audio is used only for live transcription and
 * is never recorded or uploaded.
 */
export function useInterviewRecording({
  sessionId,
  enabled,
  screenshotIntervalMs = 60_000,
}: UseInterviewRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Refs for recording infrastructure
  const screenshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenshotsRef = useRef<ScreenshotEntry[]>([]);
  const cameraCaptureQueueRef = useRef<Promise<void>>(Promise.resolve());
  const faceProcessorRef = useRef<
    Promise<LocalFaceCaptureProcessor | null> | null
  >(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { cameraStreamRef.current = cameraStream; }, [cameraStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);

  /** Acquire camera and screen streams, reusing stored streams from onboarding. */
  const acquireStreams = useCallback(async () => {
    // Reuse camera stream from onboarding if still active
    const storedCam = getStoredCameraStream();
    if (storedCam) {
      setCameraStream(storedCam);
      cameraStreamRef.current = storedCam;
      setStoredCameraStream(null);
    } else if (!wasCameraSkipped()) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
        });
        setCameraStream(cam);
        cameraStreamRef.current = cam;
      } catch (err) {
        log.warn("Camera not available:", err);
      }
    }

    // Reuse screen stream from onboarding if still active
    const storedScreen = getStoredScreenStream();
    if (storedScreen) {
      setScreenStream(storedScreen);
      screenStreamRef.current = storedScreen;
      setStoredScreenStream(null);

      storedScreen.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
        screenStreamRef.current = null;
      });
    } else if (!wasScreenSkipped()) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        setScreenStream(screen);
        screenStreamRef.current = screen;

        screen.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStream(null);
          screenStreamRef.current = null;
        });
      } catch (err) {
        log.warn("Screen share not available:", err);
      }
    }
  }, []);


  /** Process and upload a screenshot; camera images are never uploaded raw. */
  const captureAndUpload = useCallback(
    async (video: HTMLVideoElement, type: "camera" | "screen") => {
      const capture = async () => {
        if (video.readyState < 2 || video.videoWidth === 0) return;

        const timestamp = new Date().toISOString();
        let blob: Blob | null = null;
        let faceMatch: FaceMatchStatus | undefined;

        if (type === "camera") {
          try {
            const processor = await faceProcessorRef.current;
            if (!processor) {
              throw new Error("Local face analysis is unavailable");
            }
            const processed = await processor.process(video);
            blob = processed.blob;
            faceMatch = processed.faceMatch;
          } catch (err) {
            log.error("Local camera privacy processing failed:", err);
            screenshotsRef.current.push({
              url: "",
              path: "",
              timestamp,
              type,
              faceMatch: "changed",
            });
            return;
          }

          if (!blob) {
            screenshotsRef.current.push({
              url: "",
              path: "",
              timestamp,
              type,
              faceMatch: "changed",
            });
            log.warn("Camera capture withheld because no safe face image was produced");
            return;
          }
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            log.error("Could not create screen capture canvas");
            return;
          }
          context.drawImage(video, 0, 0);
          blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((value) => resolve(value), "image/jpeg", 0.7),
          );
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            log.error("Could not encode screen capture");
            return;
          }
        }

        const filename = `${timestamp.replace(/[:.]/g, "-")}-${type}.jpg`;
        try {
          const form = new FormData();
          form.append("file", blob, filename);
          form.append("sessionId", sessionId);
          form.append("type", "screenshot");
          form.append("filename", filename);

          const res = await fetch("/api/session/upload", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            log.error("Screenshot upload failed:", type, res.status);
            if (type === "camera") {
              screenshotsRef.current.push({
                url: "",
                path: "",
                timestamp,
                type,
                faceMatch: faceMatch ?? "changed",
              });
            }
            return;
          }

          const data = await res.json();
          if (typeof data.url !== "string" || typeof data.path !== "string") {
            throw new Error("Screenshot upload returned invalid metadata");
          }
          screenshotsRef.current.push({
            url: data.url,
            path: data.path,
            timestamp,
            type,
            ...(faceMatch ? { faceMatch } : {}),
          });
          log.info(`Screenshot uploaded: ${type}`);
        } catch (err) {
          log.error("Screenshot upload failed:", err);
          if (type === "camera") {
            screenshotsRef.current.push({
              url: "",
              path: "",
              timestamp,
              type,
              faceMatch: faceMatch ?? "changed",
            });
          }
        }
      };

      if (type === "camera") {
        const queuedCapture = cameraCaptureQueueRef.current.then(capture, capture);
        cameraCaptureQueueRef.current = queuedCapture.catch((err) => {
          log.error("Camera capture queue failed:", err);
        });
        try {
          await queuedCapture;
        } catch (err) {
          log.error("Camera capture failed before privacy processing completed:", err);
          screenshotsRef.current.push({
            url: "",
            path: "",
            timestamp: new Date().toISOString(),
            type,
            faceMatch: "changed",
          });
        }
      } else {
        await capture();
      }
    },
    [sessionId],
  );

  /** Take screenshots from both camera and screen streams. */
  const takeScreenshots = useCallback(async () => {
    const captures: Promise<void>[] = [];
    if (cameraVideoRef.current && cameraStreamRef.current) {
      captures.push(captureAndUpload(cameraVideoRef.current, "camera"));
    }
    if (screenVideoRef.current && screenStreamRef.current) {
      captures.push(captureAndUpload(screenVideoRef.current, "screen"));
    }
    await Promise.all(captures);
  }, [captureAndUpload]);

  /** Start periodic screenshot capture for video mode. */
  const start = useCallback(
    async () => {
      if (!enabled || isRecording) return;
      stoppedRef.current = false;
      screenshotsRef.current = [];
      cameraCaptureQueueRef.current = Promise.resolve();

      // Acquire camera + screen
      await acquireStreams();
      faceProcessorRef.current = cameraStreamRef.current
        ? createLocalFaceCaptureProcessor().catch((err) => {
            log.error("Could not initialize local face analysis:", err);
            return null;
          })
        : Promise.resolve(null);

      // Set up hidden video elements for screenshot capture
      if (!cameraVideoRef.current) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.style.display = "none";
        document.body.appendChild(v);
        cameraVideoRef.current = v;
      }
      if (!screenVideoRef.current) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.style.display = "none";
        document.body.appendChild(v);
        screenVideoRef.current = v;
      }

      // Bind streams to hidden video elements for canvas capture
      const bindStream = (video: HTMLVideoElement, stream: MediaStream | null) => {
        if (stream) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      };
      // Use refs (set in acquireStreams via state update + useEffect sync)
      // Small delay to let state sync
      setTimeout(() => {
        bindStream(cameraVideoRef.current!, cameraStreamRef.current);
        bindStream(screenVideoRef.current!, screenStreamRef.current);
      }, 500);

      // Start periodic screenshot timer
      screenshotTimerRef.current = setInterval(() => {
        void takeScreenshots().catch((err) => {
          log.error("Periodic screenshot capture failed:", err);
        });
      }, screenshotIntervalMs);

      setIsRecording(true);
      log.info("Started");
    },
    [enabled, isRecording, acquireStreams, takeScreenshots, screenshotIntervalMs],
  );

  /**
   * Stop screenshot capture and return the captured entries.
   * No microphone or assistant audio is recorded or uploaded.
   */
  const stop = useCallback(async (): Promise<{
    screenshots: ScreenshotEntry[];
  }> => {
    if (stoppedRef.current) {
      return { screenshots: screenshotsRef.current };
    }
    stoppedRef.current = true;

    // Stop screenshot timer
    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current);
      screenshotTimerRef.current = null;
    }

    // Take one final set of screenshots
    try {
      await takeScreenshots();
      await cameraCaptureQueueRef.current;
    } catch (err) {
      log.error("Final screenshot capture failed:", err);
    }

    const faceProcessor = await faceProcessorRef.current;
    try {
      await faceProcessor?.dispose();
    } catch (err) {
      log.error("Face processor disposal failed:", err);
    } finally {
      faceProcessorRef.current = null;
    }

    // Stop camera/screen tracks
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setScreenStream(null);

    // Clean up hidden video elements
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current.remove();
      cameraVideoRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
      screenVideoRef.current.remove();
      screenVideoRef.current = null;
    }

    setIsRecording(false);
    log.info("Stopped");

    return {
      screenshots: screenshotsRef.current,
    };
  }, [takeScreenshots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      void cameraCaptureQueueRef.current
        .then(async () => {
          const processor = await faceProcessorRef.current;
          await processor?.dispose();
          faceProcessorRef.current = null;
        })
        .catch((err) => log.error("Face processor cleanup failed:", err));
      if (cameraVideoRef.current) { cameraVideoRef.current.remove(); cameraVideoRef.current = null; }
      if (screenVideoRef.current) { screenVideoRef.current.remove(); screenVideoRef.current = null; }
    };
  }, []);

  return {
    start,
    stop,
    cameraStream,
    screenStream,
    isRecording,
    screenshots: screenshotsRef,
  };
}
