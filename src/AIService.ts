import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { MultiAIAssistantSettings } from "./SettingsTab";
import { App, Platform } from "obsidian";

export interface IndexedDocument {
  name: string;
  content: string;
  source: "vault" | "upload";
  imageData?: string; // Base64 string for images
  mimeType?: string;   // e.g. "image/png"
}

export interface QuizQuestion {
  question: string;
  answer: string;
  options?: string[]; // Optional for MCQ
}

export interface Flashcard {
  front: string;
  back: string;
}

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
    const images = documents.filter(d => d.imageData && d.mimeType).map(d => ({ data: d.imageData!, mimeType: d.mimeType! }));
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

    let typeNote = "";
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

    const images = documents.filter(d => d.imageData && d.mimeType).map(d => ({ data: d.imageData!, mimeType: d.mimeType! }));
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

    const images = documents.filter(d => d.imageData && d.mimeType).map(d => ({ data: d.imageData!, mimeType: d.mimeType! }));
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
    images: { data: string, mimeType: string }[] = [],
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

    const fullPrompt = `${effectiveSystemPrompt}\n\n${userMessage}`;

    if (this.settings.provider === "gemini-cli") {
      if (!Platform.isDesktop) {
        return Promise.reject(new Error("Gemini CLI is only supported on desktop."));
      }
      return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawn } = require("child_process");
        const geminiPath = "/opt/homebrew/bin/gemini";
        const args = ["--approval-mode", "yolo", "--output-format", "text", "-p", ""];
        
        if (effectiveModel && effectiveModel !== "default") {
          args.push("--model", effectiveModel);
        }

        let vaultPath = "/Users/lucyroh"; 
        try {
            const adapter = this.app.vault.adapter as any;
            if (adapter.getBasePath) vaultPath = adapter.getBasePath();
        } catch (e) {}

        const safeEnv = typeof process !== "undefined" ? process.env : {};
        const env = {
          ...safeEnv,
          PATH: ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", "/opt/homebrew/bin", "/opt/homebrew/sbin", safeEnv.PATH || ""].join(":"),
          TERM: "dumb",
          NO_COLOR: "1"
        };

        const child = spawn(geminiPath, args, { env, cwd: vaultPath, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";

        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("Gemini CLI timed out after 90 seconds."));
        }, 90000);

        child.stdout.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          if (onChunk) onChunk(chunk);
        });

        child.stderr.on("data", (data) => { stderr += data.toString(); });

        child.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(stderr || stdout || `Gemini CLI failed with code ${code}`));
        });

        child.on("error", (err) => { clearTimeout(timeout); reject(err); });

        child.stdin.write(fullPrompt);
        child.stdin.end();
      });
    }

    if (this.settings.provider === "claude-cli") {
      if (!Platform.isDesktop) {
        return Promise.reject(new Error("Claude CLI is only supported on desktop."));
      }
      return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawn } = require("child_process");
        const claudePath = "/Users/lucyroh/.local/bin/claude";
        const args = ["--print", "--output-format", "text", "--dangerously-skip-permissions"];

        if (effectiveModel && effectiveModel !== "default") {
          args.push("--model", effectiveModel);
        }

        if (effectiveSystemPrompt) {
          args.push("--system-prompt", effectiveSystemPrompt);
        }

        let vaultPath = "/Users/lucyroh";
        try {
          const adapter = this.app.vault.adapter as any;
          if (adapter.getBasePath) vaultPath = adapter.getBasePath();
        } catch (e) {}

        const safeEnv = typeof process !== "undefined" ? process.env : {};
        const env = {
          ...safeEnv,
          PATH: ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", "/opt/homebrew/bin", "/opt/homebrew/sbin", "/Users/lucyroh/.local/bin", safeEnv.PATH || ""].join(":"),
          TERM: "dumb",
          NO_COLOR: "1",
        };

        const child = spawn(claudePath, args, { env, cwd: vaultPath, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";

        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("Claude CLI timed out after 120 seconds."));
        }, 120000);

        child.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          if (onChunk) onChunk(chunk);
        });

        child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

        child.on("close", (code: number) => {
          clearTimeout(timeout);
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(stderr || stdout || `Claude CLI failed with code ${code}`));
        });

        child.on("error", (err: Error) => { clearTimeout(timeout); reject(err); });

        child.stdin.write(userMessage);
        child.stdin.end();
      });
    }

    if (this.settings.provider === "claude") {
      const buildContent = (text: string, imgs: { data: string; mimeType: string }[]): any[] => {
        const parts: any[] = [];
        if (imgs.length > 0) {
          for (const img of imgs) {
            parts.push({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.data } });
          }
        }
        parts.push({ type: "text", text });
        return parts;
      };

      const body: any = {
        model: effectiveModel,
        max_tokens: 8096,
        system: effectiveSystemPrompt,
        messages: [{ role: "user", content: buildContent(userMessage, images) }],
      };

      if (onChunk) {
        body.stream = true;
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": this.settings.apiKeys[this.settings.provider],
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Claude API error ${resp.status}: ${err}`);
        }
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]" || !data) continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                const chunk = parsed.delta.text ?? "";
                fullText += chunk;
                onChunk(chunk);
              }
            } catch { /* skip malformed lines */ }
          }
        }
        return fullText;
      } else {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": this.settings.apiKeys[this.settings.provider],
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Claude API error ${resp.status}: ${err}`);
        }
        const json = await resp.json();
        return json.content?.[0]?.text ?? "";
      }
    }

    if (this.settings.provider === "gemini") {
      const genAI = new GoogleGenerativeAI(this.settings.apiKeys[this.settings.provider]);
      const model = genAI.getGenerativeModel({ model: effectiveModel, systemInstruction: effectiveSystemPrompt });
      
      const promptParts: any[] = [userMessage];
      for (const img of images) {
        promptParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }
      
      if (onChunk) {
        const result = await model.generateContentStream(promptParts);
        let fullText = "";
        for await (const chunk of result.stream) {
          const text = chunk.text();
          fullText += text;
          onChunk(text);
        }
        return fullText;
      } else {
        const result = await model.generateContent(promptParts);
        return result.response.text();
      }
    } else {
      const client = new OpenAI({
        apiKey: this.settings.apiKeys[this.settings.provider],
        baseURL: this.settings.provider === "groq" ? "https://api.groq.com/openai/v1" : undefined,
        dangerouslyAllowBrowser: true,
      });

      const messages: any[] = [{ role: "system", content: effectiveSystemPrompt }];
      if (images.length > 0) {
        const content: any[] = [{ type: "text", text: userMessage }];
        for (const img of images) {
          content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
        }
        messages.push({ role: "user", content });
      } else {
        messages.push({ role: "user", content: userMessage });
      }

      if (onChunk) {
        const stream = await client.chat.completions.create({
          model: effectiveModel,
          messages: messages,
          stream: true,
        });
        let fullText = "";
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          fullText += text;
          onChunk(text);
        }
        return fullText;
      } else {
        const response = await client.chat.completions.create({
          model: effectiveModel,
          messages: messages,
        });
        return response.choices[0]?.message?.content ?? "";
      }
    }
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
      // Strip markdown code fences if present
      const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return fallback;
    }
  }

  private requireKey() {
    if (this.settings.provider === "gemini-cli" || this.settings.provider === "claude-cli") return;
    if (!this.settings.apiKeys[this.settings.provider]) throw new Error(`No API key set for ${this.settings.provider}. Go to Settings → Multi-AI Assistant.`);
  }

  private requireDocs(docs: IndexedDocument[]) {
    if (docs.length === 0) throw new Error("No documents added yet. Add some notes or files first.");
  }

  estimateTokenCount(documents: IndexedDocument[]): number {
    const totalChars = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    return Math.round(totalChars / 4);
  }
}
