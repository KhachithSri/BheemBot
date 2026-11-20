import {
  compareCaptureFaces,
  getSFaceAlignmentTransform,
  type FaceMatchStatus,
  type Point2D,
} from "./face-matching";

type FaceLandmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
type OnnxRuntime = typeof import("onnxruntime-web/wasm");
type OnnxSession = import("onnxruntime-web/wasm").InferenceSession;

const FACE_LANDMARKER_MODEL = "/models/mediapipe/face_landmarker.task";
const MEDIAPIPE_WASM_PATH = "/models/mediapipe/wasm";
const SFACE_MODEL = "/models/sface/face_recognition_sface_2021dec.onnx";
const ONNX_RUNTIME_MODULE = "/models/onnxruntime/ort.wasm.min.mjs";
const ONNX_WASM_PATH = "/models/onnxruntime/";
const MAX_FACES_PER_CAPTURE = 5;
const SFACE_INPUT_SIZE = 112;
// MediaPipe's face-mesh indices ordered for SFace: subject-right eye first.
const SFACE_INPUT_POINTS = [
  [33, 133],
  [362, 263],
  [1],
  [61],
  [291],
] as const;

export interface ProcessedCameraCapture {
  blob: Blob | null;
  faceMatch: FaceMatchStatus;
}

function averageLandmarks(
  landmarks: readonly { x: number; y: number }[],
  indices: readonly number[],
  width: number,
  height: number,
): Point2D | null {
  const selected = indices.map((index) => landmarks[index]);
  if (
    selected.some(
      (point) =>
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y),
    )
  ) {
    return null;
  }

  return {
    x: selected.reduce((sum, point) => sum + point.x * width, 0) / selected.length,
    y: selected.reduce((sum, point) => sum + point.y * height, 0) / selected.length,
  };
}

function getFaceLandmarks(
  landmarks: readonly { x: number; y: number }[],
  width: number,
  height: number,
): Point2D[] | null {
  const points = SFACE_INPUT_POINTS.map((indices) =>
    averageLandmarks(landmarks, indices, width, height),
  );
  return points.every((point): point is Point2D => point !== null) ? points : null;
}

function getFaceBounds(
  landmarks: readonly { x: number; y: number }[],
  width: number,
  height: number,
) {
  const finite = landmarks.filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1,
  );
  if (finite.length === 0) return null;

  const minX = Math.min(...finite.map((point) => point.x * width));
  const maxX = Math.max(...finite.map((point) => point.x * width));
  const minY = Math.min(...finite.map((point) => point.y * height));
  const maxY = Math.max(...finite.map((point) => point.y * height));
  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  if (faceWidth < 8 || faceHeight < 8) return null;

  const paddingX = faceWidth * 0.22;
  const paddingY = faceHeight * 0.22;
  const left = Math.max(0, minX - paddingX);
  const top = Math.max(0, minY - paddingY);
  const right = Math.min(width, maxX + paddingX);
  const bottom = Math.min(height, maxY + paddingY);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function getAlignedFaceCanvas(
  source: HTMLCanvasElement,
  sourcePoints: readonly Point2D[],
): HTMLCanvasElement {
  const transform = getSFaceAlignmentTransform(sourcePoints);
  if (!transform) {
    throw new Error("Could not align face landmarks for SFace");
  }

  const aligned = document.createElement("canvas");
  aligned.width = SFACE_INPUT_SIZE;
  aligned.height = SFACE_INPUT_SIZE;
  try {
    const context = aligned.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Could not create aligned face canvas");
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.setTransform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e,
      transform.f,
    );
    context.drawImage(source, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    return aligned;
  } catch (error) {
    aligned.width = 0;
    aligned.height = 0;
    throw error;
  }
}

function getFaceTensorData(aligned: HTMLCanvasElement): Float32Array {
  const context = aligned.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not read aligned face image");
  }

  const image = context.getImageData(0, 0, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE);
  const planeSize = SFACE_INPUT_SIZE * SFACE_INPUT_SIZE;
  const input = new Float32Array(planeSize * 3);
  try {
    for (let i = 0; i < planeSize; i++) {
      const pixel = i * 4;
      input[i] = image.data[pixel];
      input[planeSize + i] = image.data[pixel + 1];
      input[planeSize * 2 + i] = image.data[pixel + 2];
    }
    return input;
  } finally {
    image.data.fill(0);
  }
}

function blurFaceRegions(
  source: HTMLCanvasElement,
  faceBounds: readonly { x: number; y: number; width: number; height: number }[],
): HTMLCanvasElement {
  const blurred = document.createElement("canvas");
  blurred.width = source.width;
  blurred.height = source.height;
  const context = blurred.getContext("2d");
  if (!context || !("filter" in context)) {
    throw new Error("Canvas blur is unavailable");
  }

  try {
    context.drawImage(source, 0, 0);
    for (const bounds of faceBounds) {
      context.save();
      context.beginPath();
      context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.clip();
      context.filter = `blur(${Math.ceil(Math.max(bounds.width, bounds.height) * 0.22)}px)`;
      context.drawImage(source, 0, 0);
      context.restore();
    }
    context.filter = "none";
    return blurred;
  } catch (error) {
    blurred.width = 0;
    blurred.height = 0;
    throw error;
  }
}

function mirrorCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const mirrored = document.createElement("canvas");
  mirrored.width = source.width;
  mirrored.height = source.height;
  const context = mirrored.getContext("2d");
  if (!context) {
    throw new Error("Could not create mirrored screenshot canvas");
  }

  try {
    context.translate(source.width, 0);
    context.scale(-1, 1);
    context.drawImage(source, 0, 0);
    return mirrored;
  } catch (error) {
    mirrored.width = 0;
    mirrored.height = 0;
    throw error;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode blurred camera screenshot"));
      },
      "image/jpeg",
      0.7,
    );
  });
}

export class LocalFaceCaptureProcessor {
  private referenceEmbedding: Float32Array | null = null;
  private disposed = false;

  constructor(
    private readonly faceLandmarker: FaceLandmarker,
    private readonly runtime: OnnxRuntime,
    private readonly session: OnnxSession,
  ) {}

  async process(video: HTMLVideoElement): Promise<ProcessedCameraCapture> {
    if (this.disposed) {
      throw new Error("Face capture processor has been disposed");
    }
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera frame is not ready for local analysis");
    }

    const raw = document.createElement("canvas");
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    const rawContext = raw.getContext("2d", { willReadFrequently: true });
    if (!rawContext) {
      throw new Error("Could not create local camera analysis canvas");
    }
    rawContext.drawImage(video, 0, 0);

    try {
      const { faceLandmarks } = this.faceLandmarker.detect(raw);
      if (
        faceLandmarks.length === 0 ||
        faceLandmarks.length >= MAX_FACES_PER_CAPTURE
      ) {
        return { blob: null, faceMatch: "changed" };
      }

      const faces: Array<{
        bounds: { x: number; y: number; width: number; height: number };
        points: Point2D[];
      }> = [];
      for (const landmarks of faceLandmarks) {
        const bounds = getFaceBounds(landmarks, raw.width, raw.height);
        const points = getFaceLandmarks(landmarks, raw.width, raw.height);
        if (!bounds || !points) {
          return { blob: null, faceMatch: "changed" };
        }
        faces.push({ bounds, points });
      }
      faces.sort(
        (left, right) =>
          right.bounds.width * right.bounds.height -
          left.bounds.width * left.bounds.height,
      );

      const embeddings: Float32Array[] = [];
      try {
        for (const face of faces) {
          const aligned = getAlignedFaceCanvas(raw, face.points);
          try {
            embeddings.push(await this.getEmbedding(aligned));
          } finally {
            aligned.width = 0;
            aligned.height = 0;
          }
        }

        const comparison = compareCaptureFaces(
          this.referenceEmbedding,
          embeddings,
        );
        this.referenceEmbedding = comparison.reference;
        for (const embedding of embeddings) {
          if (embedding !== this.referenceEmbedding) embedding.fill(0);
        }

        const blurred = blurFaceRegions(raw, faces.map((face) => face.bounds));
        try {
          const mirrored = mirrorCanvas(blurred);
          try {
            return {
              blob: await canvasToJpeg(mirrored),
              faceMatch: comparison.status,
            };
          } finally {
            mirrored.width = 0;
            mirrored.height = 0;
          }
        } finally {
          blurred.width = 0;
          blurred.height = 0;
        }
      } finally {
        for (const embedding of embeddings) {
          if (embedding !== this.referenceEmbedding) embedding.fill(0);
        }
      }
    } finally {
      raw.width = 0;
      raw.height = 0;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.referenceEmbedding?.fill(0);
    this.referenceEmbedding = null;
    this.faceLandmarker.close();
    await this.session.release();
  }

  private async getEmbedding(aligned: HTMLCanvasElement): Promise<Float32Array> {
    const inputData = getFaceTensorData(aligned);
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    if (!inputName || !outputName) {
      throw new Error("SFace model does not expose input and output tensors");
    }

    let tensor: InstanceType<OnnxRuntime["Tensor"]> | null = null;
    try {
      tensor = new this.runtime.Tensor(
        "float32",
        inputData,
        [1, 3, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE],
      );
      const output = await this.session.run({ [inputName]: tensor });
      try {
        const result = output[outputName];
        if (!(result.data instanceof Float32Array) || result.data.length === 0) {
          throw new Error("SFace returned an invalid face descriptor");
        }
        return new Float32Array(result.data);
      } finally {
        for (const outputTensor of Object.values(output)) {
          outputTensor.dispose();
        }
      }
    } finally {
      tensor?.dispose();
      inputData.fill(0);
    }
  }
}

export async function createLocalFaceCaptureProcessor(): Promise<LocalFaceCaptureProcessor> {
  const [vision, runtime] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    import(/* webpackIgnore: true */ ONNX_RUNTIME_MODULE) as Promise<OnnxRuntime>,
  ]);
  runtime.env.wasm.wasmPaths = ONNX_WASM_PATH;
  runtime.env.wasm.numThreads = 1;

  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  const faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL,
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numFaces: MAX_FACES_PER_CAPTURE,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
  });

  try {
    const session = await runtime.InferenceSession.create(SFACE_MODEL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    const modelInput = session.inputMetadata[0];
    if (
      !modelInput ||
      !modelInput.isTensor ||
      modelInput.type !== "float32" ||
      modelInput.shape.length !== 4 ||
      modelInput.shape[0] !== 1 ||
      modelInput.shape[1] !== 3 ||
      modelInput.shape[2] !== SFACE_INPUT_SIZE ||
      modelInput.shape[3] !== SFACE_INPUT_SIZE
    ) {
      await session.release();
      throw new Error("SFace model has an unsupported input shape");
    }
    return new LocalFaceCaptureProcessor(faceLandmarker, runtime, session);
  } catch (error) {
    faceLandmarker.close();
    throw error;
  }
}
