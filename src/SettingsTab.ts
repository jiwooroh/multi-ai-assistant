import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type MultiAIAssistantPlugin from "../main";
import { CHARACTERS } from "./characters";

export type AIProvider = "groq" | "gemini" | "openai" | "gemini-cli" | "claude" | "claude-cli";

export interface MultiAIAssistantSettings {
  provider: AIProvider;
  apiKeys: Record<AIProvider, string>;
  model: string;
  maxNotesToIndex: number;
  systemPrompt: string;
  assistantName: string;
  assistantPhotoFilename: string; // filename inside plugin dir, e.g. "assistant-photo.png"
  quizCount: number;
  quizDifficulty: string;
  quizType: "mcq" | "short" | "subjective";
  quizLanguage: "english" | "korean" | "both";
  flashcardCount: number;
  flashcardDifficulty: string;
  flashcardLanguage: "english" | "korean" | "both";
}

export const DEFAULT_SETTINGS: MultiAIAssistantSettings = {
  provider: "groq",
  apiKeys: {
    groq: "",
    gemini: "",
    openai: "",
    "gemini-cli": "",
    claude: "",
    "claude-cli": "",
  },
  model: "llama-3.3-70b-versatile",
  maxNotesToIndex: 200,
  systemPrompt: `You are a helpful research assistant. You have access to the user's notes and the live web.
When they ask a question:
1. Answer clearly based on what IS in their notes.
2. If the answer isn't in the notes or requires up-to-date information (post-2023), use your search tools to find the latest data.
3. Point out what is MISSING or underexplored in their notes.
4. Suggest related concepts and link or add tags when relevant.
Always prioritize the user's notes, but supplement with current web information when needed.`,
  assistantName: "Neo",
  assistantPhotoFilename: "sprite-pixel.png",
  quizCount: 5,
  quizDifficulty: "medium",
  quizType: "short",
  quizLanguage: "both",
  flashcardCount: 10,
  flashcardDifficulty: "medium",
  flashcardLanguage: "both",
};

export const MODELS: Record<AIProvider, { value: string; label: string }[]> = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant",    label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768",      label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it",            label: "Gemma 2 9B" },
  ],
  gemini: [
    { value: "gemini-2.0-flash",  label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-flash",  label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro",    label: "Gemini 1.5 Pro" },
    { value: "notebooklm",        label: "NotebookLM (Source-Grounded)" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4o",      label: "GPT-4o" },
  ],
  "gemini-cli": [
    { value: "default", label: "Default" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "notebooklm", label: "NotebookLM (Source-Grounded)" },
  ],
  claude: [
    { value: "claude-opus-4-6",    label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  "claude-cli": [
    { value: "default", label: "Default (from CLI config)" },
    { value: "opus",    label: "Claude Opus (latest)" },
    { value: "sonnet",  label: "Claude Sonnet (latest)" },
    { value: "haiku",   label: "Claude Haiku (latest)" },
    { value: "claude-opus-4-6",   label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  ],
};

const FREE_KEY_URLS: Record<AIProvider, string> = {
  groq:   "https://console.groq.com/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  "gemini-cli": "https://aistudio.google.com/apikey",
  claude: "https://console.anthropic.com/settings/keys",
  "claude-cli": "https://console.anthropic.com/settings/keys",
};

const FREE_NOTICES: Record<AIProvider, string> = {
  groq:   "🆓 100% free — no credit card needed. Sign up at console.groq.com, grab an API key, done.",
  gemini: "⚠️ Free in some regions, but may require billing. If you hit payment errors, switch to Groq.",
  openai: "💳 Requires a paid OpenAI account.",
  "gemini-cli": "💻 Uses the locally installed gemini CLI tool. Supports live web search!",
  claude: "💳 Requires an Anthropic account. Get your API key at console.anthropic.com.",
  "claude-cli": "💻 Uses the locally installed claude CLI. No API key needed — uses your existing CLI login.",
};

export class MultiAIAssistantSettingsTab extends PluginSettingTab {
  plugin: MultiAIAssistantPlugin;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private modelDropdown: any;
  private noticeEl: HTMLElement;

  constructor(app: App, plugin: MultiAIAssistantPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    new Setting(containerEl).setName("Multi-AI Assistant Settings").setHeading();

    // ── Notice banner ─────────────────────────────────────────
    this.noticeEl = containerEl.createDiv("ra-settings-notice");
    this.updateNotice();

    // ── Provider ──────────────────────────────────────────────
    new Setting(containerEl)
      .setName("AI Provider")
      .setDesc("Select the AI engine.")
      .addDropdown((drop) => {
        drop
          .addOption("groq",   "Groq")
          .addOption("gemini", "Gemini")
          .addOption("gemini-cli", "Gemini CLI")
          .addOption("openai", "OpenAI")
          .addOption("claude", "Claude (Anthropic)")
          .addOption("claude-cli", "Claude CLI")
          .setValue(this.plugin.settings.provider)
          .onChange(async (value: AIProvider) => {
            this.plugin.settings.provider = value;
            this.plugin.settings.model = MODELS[value][0].value;
            await this.plugin.saveSettings();
            this.display(); // Re-render to update API key field and other descriptions
          });
      });

    // ── API Keys ──────────────────────────────────────────────
    new Setting(containerEl).setName("API Keys").setHeading();

    const keyProviders: { value: AIProvider; label: string }[] = [
      { value: "groq", label: "Groq" },
      { value: "gemini", label: "Gemini" },
      { value: "claude", label: "Claude" },
      { value: "openai", label: "OpenAI" },
    ];

    keyProviders.forEach((p) => {
      new Setting(containerEl)
        .setName(`${p.label} API Key`)
        .setDesc(`Get your key at ${FREE_KEY_URLS[p.value]}`)
        .addText((text) =>
          text
            .setPlaceholder(`${p.label} API Key`)
            .setValue(this.plugin.settings.apiKeys[p.value] || "")
            .onChange(async (value) => {
              this.plugin.settings.apiKeys[p.value] = value.trim();
              await this.plugin.saveSettings();
            })
        );
    });

    // CLI Info (No keys needed)
    const cliInfo = containerEl.createDiv("ra-settings-notice");
    cliInfo.setCssStyles({ marginTop: "10px" });
    
    cliInfo.empty();
    cliInfo.createSpan({ text: "💡 " });
    cliInfo.createEl("strong", { text: "CLI Providers:" });
    cliInfo.createSpan({ text: " Gemini CLI and Claude CLI use your local terminal login and do not require API keys here." });

    // ── Model ─────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Model")
      .addDropdown((drop) => {
        this.modelDropdown = drop;
        this.updateModelDropdown();
        drop.onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        });
      });

    // ── Max notes ─────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Max notes")
      .setDesc("Context limit.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 500, 10)
          .setValue(this.plugin.settings.maxNotesToIndex)
          .onChange(async (value) => {
            this.plugin.settings.maxNotesToIndex = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Character picker ──────────────────────────────────────
    new Setting(containerEl).setName("Assistant Character").setHeading();

    const pickerGrid = containerEl.createDiv("ra-char-picker");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginDir = (this.plugin.manifest as any).dir as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = this.app.vault.adapter as any;

    for (const char of CHARACTERS) {
      const isSelected = this.plugin.settings.assistantPhotoFilename === char.spriteFile;
      const cell = pickerGrid.createDiv("ra-char-cell" + (isSelected ? " ra-char-cell--selected" : ""));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const src = (adapter && typeof adapter.getResourcePath === "function")
        ? adapter.getResourcePath(`${pluginDir}/${char.spriteFile}`)
        : "";
      const img = cell.createEl("img", { cls: "ra-char-img" }) as HTMLImageElement;
      img.src = src;

      cell.createEl("div", { text: char.fullLabel, cls: "ra-char-label" });
      cell.createEl("div", { text: char.personality, cls: "ra-char-personality" });

      cell.addEventListener("click", async () => {
        this.plugin.settings.assistantPhotoFilename = char.spriteFile;
        this.plugin.settings.assistantName = char.name;
        await this.plugin.saveSettings();
        this.display();
      });
    }

    // ── Custom upload ─────────────────────────────────────────
    new Setting(containerEl)
      .setName("Custom photo")
      .setDesc("Or upload your own (PNG, JPG, GIF).")
      .addButton((btn) => {
        btn.setButtonText("Upload photo").onClick(() => {
          const doc = activeDocument || document;
          const input = doc.createEl("input");
          input.type = "file";
          input.accept = "image/png,image/jpeg,image/gif,image/webp";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const ext = file.name.split(".").pop() ?? "jpg";
              const filename = `assistant-photo.${ext}`;
              const buffer = await file.arrayBuffer();
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              await adapter.writeBinary(`${pluginDir}/${filename}`, buffer);
              this.plugin.settings.assistantPhotoFilename = filename;
              await this.plugin.saveSettings();
              new Notice(`Photo saved! Reload the plugin to see it.`);
            } catch (e) {
              new Notice("Failed to save photo: " + (e as Error).message);
            }
          };
          input.click();
        });
      });

    // ── Assistant name ────────────────────────────────────────
    new Setting(containerEl)
      .setName("Assistant name")
      .setDesc("Customize the name shown in the sidebar.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Luna, Sage, Pixel…")
          .setValue(this.plugin.settings.assistantName)
          .onChange(async (value) => {
            this.plugin.settings.assistantName = value.trim() || "Assistant";
            await this.plugin.saveSettings();
          })
      );

    // ── System prompt ─────────────────────────────────────────
    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("How your assistant should behave and respond. Mentioning search tools encourages live data fetching.")
      .addTextArea((text) => {
        text
          .setPlaceholder("You are a helpful research assistant…")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.setCssStyles({ width: "100%" });
      });

    // ── Quiz Settings ─────────────────────────────────────────
    new Setting(containerEl)
      .setName("Quiz Question Count")
      .setDesc("How many questions per quiz?")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.quizCount)
          .onChange(async (value) => {
            this.plugin.settings.quizCount = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Difficulty")
      .addDropdown((drop) => {
        drop
          .addOption("easy", "Easy (Simple recall)")
          .addOption("medium", "Medium (Analysis)")
          .addOption("hard", "Hard (Synthesis & Application)")
          .setValue(this.plugin.settings.quizDifficulty)
          .onChange(async (value) => {
            this.plugin.settings.quizDifficulty = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Quiz Type")
      .addDropdown((drop) => {
        drop
          .addOption("mcq", "Multiple Choice (MCQ)")
          .addOption("short", "Short Answer")
          .addOption("subjective", "Subjective / Essay")
          .setValue(this.plugin.settings.quizType || "short")
          .onChange(async (value: "mcq" | "short" | "subjective") => {
            this.plugin.settings.quizType = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Quiz Language")
      .addDropdown((drop) => {
        drop
          .addOption("both", "English & Korean")
          .addOption("english", "English Only")
          .addOption("korean", "Korean Only")
          .setValue(this.plugin.settings.quizLanguage || "both")
          .onChange(async (value: "english" | "korean" | "both") => {
            this.plugin.settings.quizLanguage = value;
            await this.plugin.saveSettings();
          });
      });

    // ── Flashcard Settings ────────────────────────────────────
    new Setting(containerEl)
      .setName("Flashcard Count")
      .setDesc("How many cards to generate?")
      .addSlider((slider) =>
        slider
          .setLimits(1, 30, 1)
          .setValue(this.plugin.settings.flashcardCount)
          .onChange(async (value) => {
            this.plugin.settings.flashcardCount = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Flashcard Difficulty")
      .addDropdown((drop) => {
        drop
          .addOption("easy", "Easy (Terms)")
          .addOption("medium", "Medium (Concepts)")
          .addOption("hard", "Hard (Detailed Theories)")
          .setValue(this.plugin.settings.flashcardDifficulty)
          .onChange(async (value) => {
            this.plugin.settings.flashcardDifficulty = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Flashcard Language")
      .addDropdown((drop) => {
        drop
          .addOption("both", "English & Korean")
          .addOption("english", "English Only")
          .addOption("korean", "Korean Only")
          .setValue(this.plugin.settings.flashcardLanguage || "both")
          .onChange(async (value: "english" | "korean" | "both") => {
            this.plugin.settings.flashcardLanguage = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private updateNotice() {
    this.noticeEl.empty();
    const provider = this.plugin.settings.provider;
    this.noticeEl.createSpan({ text: FREE_NOTICES[provider] });

    if (provider !== "gemini-cli" && provider !== "claude-cli") {
      const url = FREE_KEY_URLS[provider];
      if (url) {
        this.noticeEl.createSpan({ text: " Get your key at " });
        this.noticeEl.createEl("a", { text: url, href: url });
      }
    }
  }

  private updateModelDropdown() {
    if (!this.modelDropdown) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.modelDropdown.selectEl.empty();
    MODELS[this.plugin.settings.provider].forEach(({ value, label }) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.modelDropdown.addOption(value, label);
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    this.modelDropdown.setValue(this.plugin.settings.model);
  }
}
