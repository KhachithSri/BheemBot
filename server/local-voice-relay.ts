import { config } from "dotenv";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../src/lib/logger";
import { minimizePii } from "../src/lib/privacy/minimize";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const log = createLogger("local-voice-relay");
const PORT = Number(process.env.VOICE_RELAY_PORT || 8081);
const SPEECH_SERVICE_URL = (process.env.LOCAL_VOICE_SERVICE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const SAMPLE_RATE = 16_000;
const SILENCE_RMS = 900;
const END_SILENCE_MS = 700;
const MAX_UTTERANCE_MS = 15_000;
const AUTO_START_SPEECH_SERVICE = process.env.LOCAL_VOICE_AUTO_START !== "false";
let speechServiceProcess: ChildProcess | null = null;

function startSpeechService(): void {
  if (!AUTO_START_SPEECH_SERVICE || process.env.NODE_ENV === "test") return;

  const script = resolve(process.cwd(), "python", "local_voice_service.py");
  if (!existsSync(script)) {
    log.warn(`Local speech service script not found: ${script}`);
    return;
  }

  const configuredPython = process.env.PYTHON_EXECUTABLE;
  const command = configuredPython || (process.platform === "win32" ? "python" : "python3");
  const args = [script];

  speechServiceProcess = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  speechServiceProcess.stdout?.on("data", (data: Buffer) => log.info(`[speech] ${data.toString().trimEnd()}`));
  speechServiceProcess.stderr?.on("data", (data: Buffer) => log.error(`[speech] ${data.toString().trimEnd()}`));
  speechServiceProcess.on("error", (error) => log.error(`Could not start local speech service: ${error.message}`));
  speechServiceProcess.on("exit", (code) => {
    if (code && code !== 0) log.error(`Local speech service exited with code ${code}`);
  });
  log.info(`Started local speech service with ${command}`);
}

function stopSpeechService(): void {
  if (speechServiceProcess && !speechServiceProcess.killed) speechServiceProcess.kill();
  speechServiceProcess = null;
}

startSpeechService();

type Question = {
  text: string;
  type: string;
  description?: string | null;
  options?: { options: string[]; allowMultiple?: boolean } | null;
  order: number;
};

type Context = {
  title: string;
  objective?: string | null;
  aiName: string;
  aiTone: string;
  language: string;
  followUpDepth: string;
  startQuestionIndex?: number;
  questions: Question[];
};

type Turn = { role: "user" | "assistant"; text: string };

function questionText(question: Question): string {
  if (question.type === "CODING") return "Please read the coding problem and explain your approach.";
  if (question.type === "WHITEBOARD") return "Please complete the design on the whiteboard and explain your reasoning.";
  const options = question.options?.options;
  if (!options?.length) return question.text;
  return `${question.text} ${options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("; ")}`;
}

function removeControlTokens(text: string): string {
  return text.replace(/\[(?:NEXT|PREV)\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

function hasSkipIntent(text: string): boolean {
  return /\b(skip|next question|move on|pass)\b|跳过|下一题/i.test(text);
}

function hasPreviousIntent(text: string): boolean {
  return /\b(previous|go back|last question)\b|上一题|回到上一题/i.test(text);
}

function hasEndIntent(text: string): boolean {
  return /\b(end|finish|stop|goodbye)\b|结束|退出|再见/i.test(text);
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${SPEECH_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function transcribe(pcm: Buffer): Promise<string> {
  const response = await fetch(`${SPEECH_SERVICE_URL}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer,
  });
  if (!response.ok) throw new Error(`Local STT ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { text?: string };
  return payload.text?.trim() || "";
}

async function synthesize(text: string): Promise<Buffer> {
  const response = await postJson("/synthesize", { text, language: "en" });
  if (!response.ok) throw new Error(`Local TTS ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function askGroq(context: Context, question: Question, turns: Turn[], userText: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing; configure Groq for interviewer responses");
  const safeUserText = minimizePii(userText).text;
  const safeHistory = turns.map((turn) => `${turn.role === "user" ? "Candidate" : "Interviewer"}: ${minimizePii(turn.text).text}`).join("\n");
  const language = "English";
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.35,
      max_tokens: 220,
      messages: [
        { role: "system", content: `You are ${context.aiName}, a ${context.aiTone} interviewer for ${context.title}. Reply in ${language}. Ask at most one concise follow-up. Be specific and natural. When the answer is sufficient, append [NEXT]. When the candidate asks to return, append [PREV]. Never reveal or repeat private identifiers. Current question: ${minimizePii(question.text).text}\nConversation:\n${safeHistory}` },
        { role: "user", content: safeUserText },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

function rms(pcm: Buffer): number {
  let sum = 0;
  for (let index = 0; index + 1 < pcm.length; index += 2) {
    const sample = pcm.readInt16LE(index);
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, pcm.length / 2));
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

const wss = new WebSocketServer({ port: PORT });
log.info(`Local voice relay listening on ws://localhost:${PORT}`);
wss.on("close", stopSpeechService);

wss.on("connection", (socket) => {
  let context: Context | null = null;
  let micTest = false;
  let questionIndex = 0;
  let turns: Turn[] = [];
  let pcmBuffer = Buffer.alloc(0);
  let speechStartedAt = 0;
  let lastSpeechAt = 0;
  let processing = false;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const sortedQuestions = () => [...(context?.questions || [])].sort((a, b) => a.order - b.order);
  const currentQuestion = () => sortedQuestions()[questionIndex];
  const language = () => "en";

  const speak = async (text: string) => {
    const cleanText = removeControlTokens(text);
    if (!cleanText || closed) return;
    sendJson(socket, { type: "tts_text", data: { text: cleanText } });
    const audio = await synthesize(cleanText);
    if (!closed && socket.readyState === WebSocket.OPEN) socket.send(audio, { binary: true });
    sendJson(socket, { type: "tts_ended" });
  };

  const sendQuestion = async (announce = true) => {
    const question = currentQuestion();
    if (!question || !context) return;
    sendJson(socket, { type: "question_change", questionIndex, totalQuestions: sortedQuestions().length });
    if (announce) await speak(questionText(question));
  };

  const handleUtterance = async (rawText: string) => {
    if (!context || processing || closed) return;
    const userText = minimizePii(rawText).text.trim();
    if (!userText) return;
    processing = true;
    turns.push({ role: "user", text: userText });
    sendJson(socket, { type: "interrupt" });
    sendJson(socket, { type: "asr_ended", text: userText });
    try {
      if (hasEndIntent(userText)) {
        await speak("Thank you for your time. Goodbye.");
        sendJson(socket, { type: "interview_complete" });
        return;
      }
      if (hasPreviousIntent(userText) && questionIndex > 0) {
        questionIndex -= 1;
        turns = [];
        sendJson(socket, { type: "transitioning", direction: "previous", auto: false });
        await sendQuestion();
        return;
      }
      if (hasSkipIntent(userText)) {
        if (questionIndex >= sortedQuestions().length - 1) {
          await speak("Okay, thank you for participating. Goodbye.");
          sendJson(socket, { type: "interview_complete" });
        } else {
          questionIndex += 1;
          turns = [];
          sendJson(socket, { type: "transitioning", direction: "next", auto: false });
          await sendQuestion();
        }
        return;
      }

      const response = await askGroq(context, currentQuestion(), turns, userText);
      const goNext = /\[NEXT\]/i.test(response);
      const goPrevious = /\[PREV\]/i.test(response);
      const spoken = removeControlTokens(response);
      if (spoken) {
        turns.push({ role: "assistant", text: spoken });
        await speak(spoken);
      }
      if (goPrevious && questionIndex > 0) {
        questionIndex -= 1;
        turns = [];
        sendJson(socket, { type: "transitioning", direction: "previous", auto: true });
        await sendQuestion();
      } else if (goNext) {
        if (questionIndex >= sortedQuestions().length - 1) {
          await speak("Thank you for participating. The interview is complete.");
          sendJson(socket, { type: "interview_complete" });
        } else {
          questionIndex += 1;
          turns = [];
          sendJson(socket, { type: "transitioning", direction: "next", auto: true });
          await sendQuestion();
        }
      }
    } catch (error) {
      log.error("Local voice turn failed:", error);
      sendJson(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      processing = false;
    }
  };

  const flushAudio = async () => {
    if (processing || pcmBuffer.length < SAMPLE_RATE * 2 * 0.25) return;
    const audio = pcmBuffer;
    pcmBuffer = Buffer.alloc(0);
    speechStartedAt = 0;
    lastSpeechAt = 0;
    try {
      const text = await transcribe(audio);
      if (text) sendJson(socket, { type: "asr", data: { text } });
      if (text && micTest) {
        sendJson(socket, { type: "asr_ended", text });
      } else if (text) {
        await handleUtterance(text);
      }
    } catch (error) {
      log.error("Local STT failed:", error);
      sendJson(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === "mic_test") {
        micTest = true;
        sendJson(socket, { type: "ready", provider: "local", stt: "faster-whisper" });
        return;
      }
      if (message.type === "init" && message.context) {
        context = message.context as Context;
        questionIndex = Math.min(context.startQuestionIndex || 0, sortedQuestions().length - 1);
        sendJson(socket, { type: "ready", provider: "local", stt: "faster-whisper", tts: "piper" });
        void sendQuestion();
        return;
      }
      if (message.type === "ping") { sendJson(socket, { type: "pong" }); return; }
      if (message.type === "text_input" && typeof message.content === "string") { void handleUtterance(message.content); return; }
      if (message.type === "next_question" || message.type === "prev_question") {
        const direction = message.type === "next_question" ? 1 : -1;
        const nextIndex = questionIndex + direction;
        if (nextIndex >= 0 && nextIndex < sortedQuestions().length) {
          questionIndex = nextIndex;
          turns = [];
          sendJson(socket, { type: "transitioning", direction: direction > 0 ? "next" : "previous", auto: false });
          void sendQuestion();
        }
        return;
      }
      if (message.type === "audio" && typeof message.data === "string") {
        const chunk = Buffer.from(message.data, "hex");
        const now = Date.now();
        if (rms(chunk) >= SILENCE_RMS) {
          if (!speechStartedAt) speechStartedAt = now;
          lastSpeechAt = now;
        }
        if (speechStartedAt && now - speechStartedAt <= MAX_UTTERANCE_MS) pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
        if (speechStartedAt && (now - lastSpeechAt >= END_SILENCE_MS || now - speechStartedAt >= MAX_UTTERANCE_MS)) {
          if (endTimer) clearTimeout(endTimer);
          endTimer = setTimeout(() => void flushAudio(), 0);
        }
      }
    } catch (error) {
      log.error("Invalid browser message:", error);
    }
  });

  socket.on("close", () => {
    closed = true;
    if (endTimer) clearTimeout(endTimer);
  });
});
