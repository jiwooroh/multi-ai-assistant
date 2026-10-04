import { App, DropdownComponent, Notice, Platform, PluginSettingTab, Setting, normalizePath } from "obsidian";
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
  geminiCliPath: string;
  claudeCliPath: string;
  quizCount: number;
  quizDifficulty: string;
  quizType: "mcq" | "short" | "subjective";
  quizLanguage: "english" | "korean" | "both";
  flashcardCount: number;
  flashcardDifficulty: string;
  flashcardLanguage: "english" | "korean" | "both";
  showSelectionButton: boolean;
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
  geminiCliPath: "gemini",
  claudeCliPath: "claude",
  quizCount: 5,
  quizDifficulty: "medium",
  quizType: "short",
  quizLanguage: "both",
  flashcardCount: 10,
  flashcardDifficulty: "medium",
  flashcardLanguage: "both",
  showSelectionButton: true,
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
    { value: "notebooklm",        label: "NotebookLM (source-grounded)" },
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
    { value: "notebooklm", label: "NotebookLM (source-grounded)" },
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

const KEY_URLS: Record<AIProvider, string> = {
  groq:   "https://console.groq.com/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  "gemini-cli": "https://aistudio.google.com/apikey",
  claude: "https://console.anthropic.com/settings/keys",
  "claude-cli": "https://console.anthropic.com/settings/keys",
};

/** A notice line, split into segments so it can be built with DOM calls instead of HTML. */
type NoticeSegment = { text: string; emphasis?: "strong" | "code" };

const PROVIDER_NOTICES: Record<AIProvider, NoticeSegment[]> = {
  groq: [
    { text: "🆓 " },
    { text: "100% free", emphasis: "strong" },
    { text: " — no credit card needed. Sign up, grab an API key, done." },
  ],
  gemini: [
    { text: "⚠️ Free in some regions, but " },
    { text: "may require billing", emphasis: "strong" },
    { text: ". If you hit payment errors, switch to Groq." },
  ],
  openai: [{ text: "💳 Requires a paid OpenAI account." }],
  "gemini-cli": [
    { text: "💻 Uses the locally installed " },
    { text: "gemini", emphasis: "code" },
    { text: " CLI. Supports " },
    { text: "live web search", emphasis: "strong" },
    { text: "! Desktop only." },
  ],
  claude: [{ text: "💳 Requires an Anthropic account with API credit." }],
  "claude-cli": [
    { text: "💻 Uses the locally installed " },
    { text: "claude", emphasis: "code" },
    { text: " CLI. No API key needed — it reuses your existing CLI login. Desktop only." },
  ],
};

const CLI_PROVIDERS: AIProvider[] = ["gemini-cli", "claude-cli"];

export class MultiAIAssistantSettingsTab extends PluginSettingTab {
  plugin: MultiAIAssistantPlugin;
  private modelDropdown: DropdownComponent | null = null;

  constructor(app: App, plugin: MultiAIAssistantPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.render();
  }

  /**
   * Builds the whole settings pane. Kept separate from `display()` so internal
   * re-renders (provider switch, character pick) do not call the deprecated hook.
   */
  private render(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.buildProviderSection(containerEl);
    this.buildApiKeySection(containerEl);
    this.buildAssistantSection(containerEl);
    this.buildQuizSection(containerEl);
    this.buildFlashcardSection(containerEl);
  }

  // ── Provider ────────────────────────────────────────────────

  private buildProviderSection(containerEl: HTMLElement) {
    const noticeEl = containerEl.createDiv("ra-settings-notice");
    this.renderNotice(noticeEl);

    new Setting(containerEl)
      .setName("AI provider")
      .setDesc("Select the AI engine.")
      .addDropdown((drop) => {
        drop
          .addOption("groq", "Groq")
          .addOption("gemini", "Gemini")
          .addOption("gemini-cli", "Gemini CLI")
          .addOption("openai", "OpenAI")
          .addOption("claude", "Claude (Anthropic)")
          .addOption("claude-cli", "Claude CLI")
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as AIProvider;
            this.plugin.settings.model = MODELS[value as AIProvider][0].value;
            await this.plugin.saveSettings();
            this.render(); // re-render so the notice and model list follow the provider
          });
      });

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

    new Setting(containerEl)
      .setName("Max notes to index")
      .setDesc("Upper bound on how many vault notes are pulled into context.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 500, 10)
          .setValue(this.plugin.settings.maxNotesToIndex)
          .onChange(async (value) => {
            this.plugin.settings.maxNotesToIndex = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show selection button")
      .setDesc("Show a floating \"Ask\" button next to text you select, to send it to the assistant.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSelectionButton)
          .onChange(async (value) => {
            this.plugin.settings.showSelectionButton = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderNotice(noticeEl: HTMLElement) {
    const provider = this.plugin.settings.provider;
    noticeEl.empty();

    for (const segment of PROVIDER_NOTICES[provider]) {
      if (segment.emphasis === "strong") noticeEl.createEl("strong", { text: segment.text });
      else if (segment.emphasis === "code") noticeEl.createEl("code", { text: segment.text });
      else noticeEl.appendText(segment.text);
    }

    if (!CLI_PROVIDERS.includes(provider)) {
      noticeEl.appendText(" Get your key at ");
      noticeEl.createEl("a", { text: KEY_URLS[provider], href: KEY_URLS[provider] });
    }
  }

  // ── API keys ────────────────────────────────────────────────

  private buildApiKeySection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("API keys").setHeading();

    const keyProviders: { value: AIProvider; label: string }[] = [
      { value: "groq", label: "Groq" },
      { value: "gemini", label: "Gemini" },
      { value: "claude", label: "Claude" },
      { value: "openai", label: "OpenAI" },
    ];

    for (const p of keyProviders) {
      new Setting(containerEl)
        .setName(`${p.label} API key`)
        .setDesc(`Get your key at ${KEY_URLS[p.value]}`)
        .addText((text) =>
          text
            .setPlaceholder(`${p.label} API key`)
            .setValue(this.plugin.settings.apiKeys[p.value] || "")
            .onChange(async (value) => {
              this.plugin.settings.apiKeys[p.value] = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    if (!Platform.isDesktop) return;

    new Setting(containerEl).setName("Local CLI providers").setHeading();

    const cliInfo = containerEl.createDiv("ra-settings-notice ra-settings-notice--spaced");
    cliInfo.appendText("💡 The Gemini CLI and Claude CLI providers run a command on your computer and reuse its existing login, so no API key is needed. They are desktop only.");

    new Setting(containerEl)
      .setName("Gemini CLI command")
      .setDesc("Command or absolute path used to launch the Gemini CLI.")
      .addText((text) =>
        text
          .setPlaceholder("gemini")
          .setValue(this.plugin.settings.geminiCliPath)
          .onChange(async (value) => {
            this.plugin.settings.geminiCliPath = value.trim() || "gemini";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Claude CLI command")
      .setDesc("Command or absolute path used to launch the Claude CLI.")
      .addText((text) =>
        text
          .setPlaceholder("claude")
          .setValue(this.plugin.settings.claudeCliPath)
          .onChange(async (value) => {
            this.plugin.settings.claudeCliPath = value.trim() || "claude";
            await this.plugin.saveSettings();
          })
      );
  }

  // ── Assistant ───────────────────────────────────────────────

  private buildAssistantSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("Assistant character").setHeading();

    const pickerGrid = containerEl.createDiv("ra-char-picker");
    const manifestDir = this.plugin.manifest.dir as string;
    const pluginDir = manifestDir || normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`);

    for (const char of CHARACTERS) {
      const isSelected = this.plugin.settings.assistantPhotoFilename === char.spriteFile;
      const cell = pickerGrid.createDiv("ra-char-cell" + (isSelected ? " ra-char-cell--selected" : ""));

      cell.createEl("img", {
        cls: "ra-char-img",
        attr: { src: char.base64, alt: char.name },
      });
      cell.createDiv({ text: char.fullLabel, cls: "ra-char-label" });
      cell.createDiv({ text: char.personality, cls: "ra-char-personality" });

      cell.addEventListener("click", () => void this.selectCharacter(char.spriteFile, char.name));
    }

    new Setting(containerEl)
      .setName("Custom photo")
      .setDesc("Or upload your own (PNG, JPG, GIF, WebP).")
      .addButton((btn) => {
        btn.setButtonText("Upload photo").onClick(() => {
          const input = createEl("input", {
            attr: { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp" },
          });
          input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (file) void this.saveCustomPhoto(file, pluginDir);
          });
          input.click();
        });
      });

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
        text.inputEl.addClass("ra-settings-textarea");
      });
  }

  private async selectCharacter(spriteFile: string, name: string) {
    this.plugin.settings.assistantPhotoFilename = spriteFile;
    this.plugin.settings.assistantName = name;
    await this.plugin.saveSettings();
    this.render();
  }

  private async saveCustomPhoto(file: File, pluginDir: string) {
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `assistant-photo.${ext}`;
      const buffer = await file.arrayBuffer();
      await this.app.vault.adapter.writeBinary(`${pluginDir}/${filename}`, buffer);
      this.plugin.settings.assistantPhotoFilename = filename;
      await this.plugin.saveSettings();
      new Notice("Photo saved. Reload the plugin to see it.");
    } catch (e) {
      new Notice("Failed to save photo: " + (e as Error).message);
    }
  }

  // ── Quiz ────────────────────────────────────────────────────

  private buildQuizSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("Quiz").setHeading();

    new Setting(containerEl)
      .setName("Question count")
      .setDesc("How many questions per quiz.")
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
          .addOption("easy", "Easy (simple recall)")
          .addOption("medium", "Medium (analysis)")
          .addOption("hard", "Hard (synthesis and application)")
          .setValue(this.plugin.settings.quizDifficulty)
          .onChange(async (value) => {
            this.plugin.settings.quizDifficulty = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Question type")
      .addDropdown((drop) => {
        drop
          .addOption("mcq", "Multiple choice")
          .addOption("short", "Short answer")
          .addOption("subjective", "Subjective / essay")
          .setValue(this.plugin.settings.quizType || "short")
          .onChange(async (value) => {
            this.plugin.settings.quizType = value as MultiAIAssistantSettings["quizType"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Language")
      .addDropdown((drop) => {
        drop
          .addOption("both", "English and Korean")
          .addOption("english", "English only")
          .addOption("korean", "Korean only")
          .setValue(this.plugin.settings.quizLanguage || "both")
          .onChange(async (value) => {
            this.plugin.settings.quizLanguage = value as MultiAIAssistantSettings["quizLanguage"];
            await this.plugin.saveSettings();
          });
      });
  }

  // ── Flashcards ──────────────────────────────────────────────

  private buildFlashcardSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("Flashcards").setHeading();

    new Setting(containerEl)
      .setName("Card count")
      .setDesc("How many cards to generate.")
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
      .setName("Difficulty")
      .addDropdown((drop) => {
        drop
          .addOption("easy", "Easy (terms)")
          .addOption("medium", "Medium (concepts)")
          .addOption("hard", "Hard (detailed theories)")
          .setValue(this.plugin.settings.flashcardDifficulty)
          .onChange(async (value) => {
            this.plugin.settings.flashcardDifficulty = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Language")
      .addDropdown((drop) => {
        drop
          .addOption("both", "English and Korean")
          .addOption("english", "English only")
          .addOption("korean", "Korean only")
          .setValue(this.plugin.settings.flashcardLanguage || "both")
          .onChange(async (value) => {
            this.plugin.settings.flashcardLanguage = value as MultiAIAssistantSettings["flashcardLanguage"];
            await this.plugin.saveSettings();
          });
      });
  }

  private updateModelDropdown() {
    const drop = this.modelDropdown;
    if (!drop) return;
    drop.selectEl.empty();
    for (const { value, label } of MODELS[this.plugin.settings.provider]) {
      drop.addOption(value, label);
    }
    drop.setValue(this.plugin.settings.model);
  }
}
