import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import OpenAI from "openai";
import type { MultiAIAssistantSettings } from "./SettingsTab";
import { App, FileSystemAdapter, Platform, requestUrl } from "obsidian";

export interface IndexedDocument {
  name: string;
  content: string;
  source: "vault" | "upload";
  imageData?: string; // Base64 string for images
  mimeType?: string;  // e.g. "image/png"
}

export interface QuizQuestion {
  question: string;
  answer: string;
  options?: string[]; // Only present for MCQ
}

export interface Flashcard {
  front: string;
  back: string;
}

interface InlineImage {
  data: string;
  mimeType: string;
}

interface ClaudeTextBlock {
  type: "text";
  text: string;
}

interface ClaudeImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
}

type ClaudeContentBlock = ClaudeTextBlock | ClaudeImageBlock;

interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: ClaudeContentBlock[] }[];
  stream?: boolean;
}

interface ClaudeMessageResponse {
  content?: { type: string; text?: string }[];
}

interface ClaudeStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Directories added to PATH so GUI-launched Obsidian can find CLIs installed by Homebrew etc. */
const EXTRA_CLI_PATHS = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
];

export class AIService {
  private settings: MultiAIAssistantSettings;
  private app: App;

  constructor(settings: MultiAIAssistantSettings, app: App) {
    this.settings = settings;
    this.app = app;
  }

  updateSettings(settings: MultiAIAssistantSettings) {
    this.settings = settings;
  }

  // ── Chat ──────────────────────────────────────────────────

  async ask(question: string, documents: IndexedDocument[], onChunk?: (chunk: string) => void): Promise<string> {
    this.requireKey();
    const images = this.collectImages(documents);
    if (documents.length === 0) {
      return this.complete(this.settings.systemPrompt, question, images, onChunk);
    }
    const context = this.buildContext(documents);
    return this.complete(this.settings.systemPrompt, `${context}\n\n---\n\nQuestion: ${question}`, images, onChunk);
  }

  // ── Quiz ──────────────────────────────────────────────────

  async generateQuiz(documents: IndexedDocument[]): Promise<QuizQuestion[]> {
    this.requireKey();
    this.requireDocs(documents);
    const count = this.settings.quizCount || 5;
    const difficulty = this.settings.quizDifficulty || "medium";
    const quizType = this.settings.quizType || "short";
    const language = this.settings.quizLanguage || "both";

    let typeNote: string;
    if (quizType === "mcq") {
      typeNote = "Generate Multiple Choice Questions (MCQ). For each question, provide 4 distinct options in an 'options' array. The 'question' string should only contain the question text itself. The 'answer' field should contain the correct option text (e.g. 'Paris').";
    } else if (quizType === "subjective") {
      typeNote = "Generate subjective or essay-style questions that require deeper explanation and critical thinking.";
    } else {
      typeNote = "Generate short-answer questions that test factual knowledge and understanding.";
    }

    const langNote = language === "both"
      ? "Provide the questions and answers in BOTH English and Korean (e.g. 'Question (질문)')."
      : `Provide everything in ${language === "korean" ? "Korean (한국어)" : "English"} only.`;

    const images = this.collectImages(documents);
    const context = this.buildContext(documents);
    const prompt = `${context}

---

Generate exactly ${count} quiz questions based on the notes above.
Difficulty level: ${difficulty}.
Quiz Type: ${quizType} (${typeNote}).

Return ONLY a JSON array with no markdown, no explanation, just the raw JSON:
[{"question":"...","answer":"...", "options": ["option1", "option2", "option3", "option4"]}, ...]
Note: Only include "options" for MCQ.

Make questions that test understanding, not just memorization. Vary difficulty.
IMPORTANT: ${langNote}`;

    const raw = await this.complete("You are a quiz generator. Return only valid JSON.", prompt, images);
    return this.parseJSON<QuizQuestion[]>(raw, []);
  }

  async evaluateAnswer(question: string, modelAnswer: string, userAnswer: string): Promise<{ correct: boolean; feedback: string }> {
    this.requireKey();
    const prompt = `Question: ${question}
Model answer: ${modelAnswer}
Student's answer: ${userAnswer}

Evaluate the student's answer. Return ONLY JSON: {"correct": true/false, "feedback": "..."}
Be generous — partial credit counts as correct. Give encouraging, specific feedback.
Provide feedback in Korean if the user's answer is in Korean.`;

    const raw = await this.complete("You are a helpful tutor. Return only valid JSON.", prompt);
    return this.parseJSON(raw, { correct: false, feedback: "Could not evaluate." });
  }

  // ── Flashcards ────────────────────────────────────────────

  async generateFlashcards(documents: IndexedDocument[]): Promise<Flashcard[]> {
    this.requireKey();
    this.requireDocs(documents);
    const count = this.settings.flashcardCount || 10;
    const difficulty = this.settings.flashcardDifficulty || "medium";
    const language = this.settings.flashcardLanguage || "both";
    const langNote = language === "both"
      ? "Provide the content in BOTH English and Korean (e.g. 'Term (용어)')."
      : `Provide everything in ${language === "korean" ? "Korean (한국어)" : "English"} only.`;

    const images = this.collectImages(documents);
    const context = this.buildContext(documents);
    const prompt = `${context}

---

Create exactly ${count} flashcards based on the notes above.
Difficulty level: ${difficulty}.
Return ONLY a JSON array with no markdown, no explanation, just the raw JSON:
[{"front":"term or question","back":"definition or answer"}, ...]

Focus on key concepts, definitions, and relationships worth memorising.
IMPORTANT: ${langNote}`;

    const raw = await this.complete("You are a flashcard generator. Return only valid JSON.", prompt, images);
    return this.parseJSON<Flashcard[]>(raw, []);
  }

  // ── Shared helpers ────────────────────────────────────────

  private async complete(
    systemPrompt: string,
    userMessage: string,
    images: InlineImage[] = [],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    let effectiveSystemPrompt = systemPrompt;
    let effectiveModel = this.settings.model;

    if (this.settings.model === "notebooklm") {
      effectiveModel = "gemini-1.5-pro";
      effectiveSystemPrompt = `You are a specialized research assistant acting like NotebookLM.
Your goal is to provide deep, source-grounded answers based EXCLUSIVELY on the provided documents.
1. ALWAYS provide citations in [Source Name] format (e.g., [Notes.md]).
2. Be proactive in summarizing and identifying key concepts.
3. If the answer is not in the documents, state so clearly and do not hallucinate.
4. Maintain a professional, academic, yet helpful tone.
5. Prioritize synthesizing information across multiple sources.

Current context:
${systemPrompt}`;
    }

    switch (this.settings.provider) {
      case "gemini-cli":
        return this.completeWithGeminiCli(effectiveSystemPrompt, userMessage, effectiveModel, onChunk);
      case "claude-cli":
        return this.completeWithClaudeCli(effectiveSystemPrompt, userMessage, effectiveModel, onChunk);
      case "claude":
        return this.completeWithClaude(effectiveSystemPrompt, userMessage, effectiveModel, images, onChunk);
      case "gemini":
        return this.completeWithGemini(effectiveSystemPrompt, userMessage, effectiveModel, images, onChunk);
      default:
        return this.completeWithOpenAICompatible(effectiveSystemPrompt, userMessage, effectiveModel, images, onChunk);
    }
  }

  // ── Local CLI providers ───────────────────────────────────

  private completeWithGeminiCli(
    systemPrompt: string,
    userMessage: string,
    model: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const args = ["--approval-mode", "yolo", "--output-format", "text", "-p", ""];
    if (model && model !== "default") args.push("--model", model);

    return this.runCli({
      label: "Gemini CLI",
      command: this.settings.geminiCliPath || "gemini",
      args,
      stdin: `${systemPrompt}\n\n${userMessage}`,
      timeoutMs: 90_000,
      onChunk,
    });
  }

  private completeWithClaudeCli(
    systemPrompt: string,
    userMessage: string,
    model: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const args = ["--print", "--output-format", "text"];
    if (model && model !== "default") args.push("--model", model);
    if (systemPrompt) args.push("--system-prompt", systemPrompt);

    return this.runCli({
      label: "Claude CLI",
      command: this.settings.claudeCliPath || "claude",
      args,
      stdin: userMessage,
      timeoutMs: 120_000,
      onChunk,
    });
  }

  /**
   * Runs a locally installed CLI and returns its stdout.
   * Desktop only — `child_process` does not exist on mobile, so it is imported
   * lazily behind the `Platform.isDesktop` guard below.
   */
  private async runCli(opts: {
    label: string;
    command: string;
    args: string[];
    stdin: string;
    timeoutMs: number;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    if (!Platform.isDesktop) {
      throw new Error(`${opts.label} is only supported on desktop.`);
    }

    const { spawn } = await import("node:child_process");

    return new Promise<string>((resolve, reject) => {
      const child = spawn(opts.command, opts.args, {
        env: this.cliEnv(),
        cwd: this.vaultBasePath(),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      const timeout = window.setTimeout(() => {
        child.kill();
        reject(new Error(`${opts.label} timed out after ${Math.round(opts.timeoutMs / 1000)} seconds.`));
      }, opts.timeoutMs);

      child.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        opts.onChunk?.(chunk);
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code: number | null) => {
        window.clearTimeout(timeout);
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr || stdout || `${opts.label} failed with exit code ${code ?? "unknown"}.`));
      });

      child.on("error", (err: Error) => {
        window.clearTimeout(timeout);
        reject(new Error(`${opts.label} could not be started (${opts.command}): ${err.message}`));
      });

      child.stdin.write(opts.stdin);
      child.stdin.end();
    });
  }

  private cliEnv(): Record<string, string | undefined> {
    const base: Record<string, string | undefined> =
      typeof process !== "undefined" && process.env ? { ...process.env } : {};
    const home = base.HOME;
    const paths = [...EXTRA_CLI_PATHS];
    if (home) paths.push(`${home}/.local/bin`);
    if (base.PATH) paths.push(base.PATH);

    return { ...base, PATH: paths.join(":"), TERM: "dumb", NO_COLOR: "1" };
  }

  private vaultBasePath(): string | undefined {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  }

  // ── Claude (Anthropic API) ────────────────────────────────

  private async completeWithClaude(
    systemPrompt: string,
    userMessage: string,
    model: string,
    images: InlineImage[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const content: ClaudeContentBlock[] = images.map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mimeType, data: img.data },
    }));
    content.push({ type: "text", text: userMessage });

    const body: ClaudeRequestBody = {
      model,
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    };

    const headers: Record<string, string> = {
      "x-api-key": this.settings.apiKeys.claude,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    };

    if (!onChunk) {
      const resp = await requestUrl({
        url: ANTHROPIC_MESSAGES_URL,
        method: "POST",
        headers,
        body: JSON.stringify(body),
        throw: false,
      });
      if (resp.status >= 400) {
        throw new Error(`Claude API error ${resp.status}: ${resp.text}`);
      }
      const json = resp.json as ClaudeMessageResponse;
      return json.content?.[0]?.text ?? "";
    }

    // `requestUrl` buffers the whole response, so token-by-token streaming has to
    // go through `fetch`. The extra header opts in to direct browser access.
    body.stream = true;
    const resp = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: { ...headers, "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(body),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`Claude API error ${resp.status}: ${await resp.text()}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        let parsed: ClaudeStreamEvent;
        try {
          parsed = JSON.parse(data) as ClaudeStreamEvent;
        } catch {
          continue; // partial or keep-alive line
        }
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          const chunk = parsed.delta.text ?? "";
          fullText += chunk;
          onChunk(chunk);
        }
      }
    }
    return fullText;
  }

  // ── Gemini ────────────────────────────────────────────────

  private async completeWithGemini(
    systemPrompt: string,
    userMessage: string,
    model: string,
    images: InlineImage[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const genAI = new GoogleGenerativeAI(this.settings.apiKeys.gemini);
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });

    const promptParts: (string | Part)[] = [userMessage];
    for (const img of images) {
      promptParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }

    if (!onChunk) {
      const result = await generativeModel.generateContent(promptParts);
      return result.response.text();
    }

    const result = await generativeModel.generateContentStream(promptParts);
    let fullText = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      onChunk(text);
    }
    return fullText;
  }

  // ── OpenAI / Groq ─────────────────────────────────────────

  private async completeWithOpenAICompatible(
    systemPrompt: string,
    userMessage: string,
    model: string,
    images: InlineImage[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const client = new OpenAI({
      apiKey: this.settings.apiKeys[this.settings.provider],
      baseURL: this.settings.provider === "groq" ? "https://api.groq.com/openai/v1" : undefined,
      dangerouslyAllowBrowser: true,
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    if (images.length > 0) {
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: "text", text: userMessage },
      ];
      for (const img of images) {
        content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
      }
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    if (!onChunk) {
      const response = await client.chat.completions.create({ model, messages });
      return response.choices[0]?.message?.content ?? "";
    }

    const stream = await client.chat.completions.create({ model, messages, stream: true });
    let fullText = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      fullText += text;
      onChunk(text);
    }
    return fullText;
  }

  // ── Utilities ─────────────────────────────────────────────

  private collectImages(documents: IndexedDocument[]): InlineImage[] {
    const images: InlineImage[] = [];
    for (const doc of documents) {
      if (doc.imageData && doc.mimeType) {
        images.push({ data: doc.imageData, mimeType: doc.mimeType });
      }
    }
    return images;
  }

  private buildContext(documents: IndexedDocument[]): string {
    const sections = documents.map((doc) => {
      const label = doc.source === "vault" ? `[Vault Note: ${doc.name}]` : `[Uploaded File: ${doc.name}]`;
      return `${label}\n${doc.content}`;
    });
    return `Here are the user's notes and readings:\n\n${sections.join("\n\n---\n\n")}`;
  }

  private parseJSON<T>(raw: string, fallback: T): T {
    try {
      // Strip markdown code fences if the model wrapped its JSON in them.
      const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return fallback;
    }
  }

  private requireKey() {
    if (this.settings.provider === "gemini-cli" || this.settings.provider === "claude-cli") return;
    if (!this.settings.apiKeys[this.settings.provider]) {
      throw new Error(`No API key set for ${this.settings.provider}. Go to Settings → Multi-AI Assistant.`);
    }
  }

  private requireDocs(docs: IndexedDocument[]) {
    if (docs.length === 0) throw new Error("No documents added yet. Add some notes or files first.");
  }

  estimateTokenCount(documents: IndexedDocument[]): number {
    const totalChars = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    return Math.round(totalChars / 4);
  }
}
