import {
  ItemView,
  MarkdownRenderer,
  Notice,
  Platform,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf,
  setIcon,
  normalizePath,
} from "obsidian";
import type MultiAIAssistantPlugin from "../main";
import type { IndexedDocument, QuizQuestion, Flashcard } from "./AIService";
import { FileProcessor } from "./FileProcessor";
import { MODELS, AIProvider, MultiAIAssistantSettings } from "./SettingsTab";
import { CHARACTERS, Character, getCharacterBySprite } from "./characters";

export const VIEW_TYPE = "multi-ai-assistant-sidebar";

const DEFAULT_SPRITE = "sprite-pixel.png";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const READABLE_EXTENSIONS = ["md", "txt", "pdf", ...IMAGE_EXTENSIONS];
const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

type Mode = "home" | "chat" | "quiz" | "flashcards" | "notebooklm";
type DropdownResult =
  | { type: "note"; file: TFile }
  | { type: "folder"; folder: TFolder; count: number };

export class SidebarView extends ItemView {
  plugin: MultiAIAssistantPlugin;
  private documents: IndexedDocument[] = [];
  private processor: FileProcessor;
  private mode: Mode = "home";
  private catSrc = "";
  private kbOpen = true;
  private kbContentOpen = true;

  // Shared KB refs
  private kbBody: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchWrapEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement;
  private charDropdownEl: HTMLElement | null = null;
  private sourceChipsEl: HTMLElement;
  private tokenCountEl: HTMLElement;
  private activeFileEl: HTMLElement;
  private dropdownVisible = false;
  private focusedIndex = -1;
  private currentResults: DropdownResult[] = [];

  // Chat refs
  private chatEl: HTMLElement;
  private chatInput: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;

  // Quiz state
  private quizQuestions: QuizQuestion[] = [];
  private quizIndex = 0;
  private quizAnswered = false;
  private quizScore = 0;
  private quizStarted = false;

  // Flashcard state
  private flashcards: Flashcard[] = [];
  private cardIndex = 0;
  private cardFlipped = false;
  private cardKnown: boolean[] = [];
  private flashcardsStarted = false;

  constructor(leaf: WorkspaceLeaf, plugin: MultiAIAssistantPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.processor = new FileProcessor(plugin.app);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.plugin.settings.assistantName || "Assistant"; }
  getIcon() { return "bot"; }

  private getSpriteSrc(filename: string): string {
    const char = CHARACTERS.find((c) => c.spriteFile === filename);
    if (char && char.base64) {
      return char.base64;
    }
    const manifestDir = this.plugin.manifest.dir as string;
    const pluginDir = manifestDir || normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`);
    return this.app.vault.adapter.getResourcePath(normalizePath(`${pluginDir}/${filename}`));
  }

  async onOpen() {
    this.catSrc = this.getSpriteSrc(this.plugin.settings.assistantPhotoFilename || DEFAULT_SPRITE);

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFileUI()));

    // Registered once for the life of the view — the handlers read the current
    // element refs, which are replaced on every render().
    this.registerDomEvent(document, "click", (e) => {
      this.charDropdownEl?.addClass("ra-hidden");
      if (this.searchWrapEl && !this.searchWrapEl.contains(e.target as Node)) this.hideDropdown();
    });

    this.render();
  }

  async onClose() {
    this.charDropdownEl = null;
    this.searchWrapEl = null;
  }

  public async searchExternal(query: string) {
    this.setMode("chat");
    this.chatInput.value = query;
    this.autoGrow(this.chatInput);
    await this.submitChat();
  }

  // ════════════════════════════════════════════════════════
  // Root render
  // ════════════════════════════════════════════════════════

  private render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("ra-root");
    this.charDropdownEl = null;
    this.searchWrapEl = null;
    this.buildHeader(root);
    this.buildKBPanel(root);
    if (this.mode === "home")             this.buildHomePage(root);
    else if (this.mode === "chat")        this.buildChatPage(root);
    else if (this.mode === "quiz")        this.buildQuizPage(root);
    else if (this.mode === "flashcards")  this.buildFlashcardsPage(root);
    else if (this.mode === "notebooklm")  this.buildNotebookLMPage(root);
  }

  private setMode(m: Mode) { this.mode = m; this.render(); }

  /** Grows a textarea with its content, up to a fixed cap. */
  private autoGrow(el: HTMLTextAreaElement) {
    el.setCssProps({ "--ra-input-height": "auto" });
    el.setCssProps({ "--ra-input-height": `${Math.min(el.scrollHeight, 120)}px` });
  }

  // ════════════════════════════════════════════════════════
  // Header
  // ════════════════════════════════════════════════════════

  private buildHeader(root: HTMLElement) {
    const header = root.createDiv("ra-header");
    if (this.catSrc) {
      header.createEl("img", { cls: "ra-header-avatar", attr: { src: this.catSrc, alt: "" } });
    }
    const char = getCharacterBySprite(this.plugin.settings.assistantPhotoFilename || DEFAULT_SPRITE);
    const txt = header.createDiv("ra-header-text");
    txt.createDiv({ text: char.englishTag, cls: "ra-header-korean" });
    txt.createDiv({ text: char.name, cls: "ra-header-name" });
    txt.createDiv({ text: char.personality, cls: "ra-header-sub" });

    const right = header.createDiv("ra-header-right");
    if (this.mode !== "home") {
      const homeBtn = right.createEl("button", { cls: "ra-icon-btn", attr: { "aria-label": "Home" } });
      setIcon(homeBtn, "home");
      homeBtn.addEventListener("click", () => this.setMode("home"));
    }

    // Character picker button + dropdown
    const charPickerWrap = right.createDiv("ra-char-picker-wrap");
    const charBtn = charPickerWrap.createEl("button", {
      cls: "ra-icon-btn ra-char-pick-btn",
      attr: { "aria-label": "Switch character" },
    });
    setIcon(charBtn, "users");

    const dropdown = charPickerWrap.createDiv("ra-char-pick-dropdown ra-hidden");
    this.charDropdownEl = dropdown;

    const currentFile = this.plugin.settings.assistantPhotoFilename || DEFAULT_SPRITE;
    for (const c of CHARACTERS) {
      const item = dropdown.createDiv(
        "ra-char-pick-item" + (c.spriteFile === currentFile ? " ra-char-pick-item--active" : "")
      );
      item.createEl("img", {
        cls: "ra-char-pick-img",
        attr: { src: this.getSpriteSrc(c.spriteFile), alt: "" },
      });
      const text = item.createDiv("ra-char-pick-text");
      text.createSpan({ text: c.name, cls: "ra-char-pick-name" });
      text.createSpan({ text: c.englishTag, cls: "ra-char-pick-tag" });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dropdown.addClass("ra-hidden");
        void this.switchCharacter(c);
      });
    }

    charBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.toggleClass("ra-hidden", !dropdown.hasClass("ra-hidden"));
    });

    const kbBtn = right.createEl("button", { cls: "ra-icon-btn", attr: { "aria-label": "Toggle knowledge base" } });
    setIcon(kbBtn, "menu");
    kbBtn.addEventListener("click", () => {
      this.kbOpen = !this.kbOpen;
      this.kbBody.toggleClass("ra-hidden", !this.kbOpen);
    });
  }

  // ════════════════════════════════════════════════════════
  // KB panel (shared)
  // ════════════════════════════════════════════════════════

  private buildKBPanel(root: HTMLElement) {
    this.kbBody = root.createDiv("ra-kb-panel");
    this.kbBody.toggleClass("ra-hidden", !this.kbOpen);

    const kbHeader = this.kbBody.createDiv("ra-kb-header");
    const kbToggle = kbHeader.createDiv("ra-kb-toggle");
    setIcon(kbToggle, "chevron-down");
    kbHeader.createSpan({ text: "Knowledge base", cls: "ra-kb-title" });

    const kbContent = this.kbBody.createDiv("ra-kb-content");
    const syncFold = () => {
      kbContent.toggleClass("ra-hidden", !this.kbContentOpen);
      kbToggle.toggleClass("ra-kb-toggle--collapsed", !this.kbContentOpen);
    };
    syncFold();

    kbHeader.addEventListener("click", () => {
      this.kbContentOpen = !this.kbContentOpen;
      syncFold();
    });

    this.buildProviderSelectors(kbContent);

    // Current file auto-include info
    this.activeFileEl = kbContent.createDiv("ra-active-file-info");
    this.updateActiveFileUI();

    const searchWrap = kbContent.createDiv("ra-search-wrap");
    this.searchWrapEl = searchWrap;
    this.searchInput = searchWrap.createEl("input", {
      cls: "ra-search-input",
      attr: { placeholder: "Add more notes or folders…", type: "text" },
    });
    this.dropdownEl = searchWrap.createDiv("ra-dropdown ra-hidden");

    this.searchInput.addEventListener("input", () => this.onSearchInput());
    this.searchInput.addEventListener("focus", () => this.onSearchInput());
    this.searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.onSearchKeydown(e);
    });

    this.tokenCountEl = kbContent.createDiv({ text: "", cls: "ra-token-count" });
    this.sourceChipsEl = kbContent.createDiv("ra-source-chips");
    this.refreshSources();

    this.buildUploadArea(kbContent);
  }

  private buildProviderSelectors(kbContent: HTMLElement) {
    const selectorWrap = kbContent.createDiv("ra-mode-selector");
    const providerSelect = selectorWrap.createEl("select", { cls: "ra-mode-select" });
    const modelSelect = selectorWrap.createEl("select", { cls: "ra-mode-select" });

    const allProviders: { value: AIProvider; label: string }[] = [
      { value: "groq", label: "Groq" },
      { value: "gemini", label: "Gemini" },
      { value: "gemini-cli", label: "Gemini CLI" },
      { value: "openai", label: "OpenAI" },
      { value: "claude", label: "Claude" },
      { value: "claude-cli", label: "Claude CLI" },
    ];
    // The CLI providers shell out to a local binary, which mobile does not have.
    const providers = Platform.isDesktop
      ? allProviders
      : allProviders.filter((p) => p.value !== "gemini-cli" && p.value !== "claude-cli");

    for (const p of providers) {
      const opt = providerSelect.createEl("option", { value: p.value, text: p.label });
      if (this.plugin.settings.provider === p.value) opt.selected = true;
    }

    const updateModelOptions = () => {
      modelSelect.empty();
      const models = MODELS[providerSelect.value as AIProvider] || [];
      for (const m of models) {
        const opt = modelSelect.createEl("option", { value: m.value, text: m.label });
        if (this.plugin.settings.model === m.value) opt.selected = true;
      }
    };
    updateModelOptions();

    providerSelect.addEventListener("change", () => {
      const newProvider = providerSelect.value as AIProvider;
      this.plugin.settings.provider = newProvider;
      this.plugin.settings.model = MODELS[newProvider][0].value;
      updateModelOptions();
      void this.plugin.saveSettings();
      new Notice(`Switched to ${newProvider}`);
    });

    modelSelect.addEventListener("change", () => {
      this.plugin.settings.model = modelSelect.value;
      void this.plugin.saveSettings();
      new Notice(`Model set to ${modelSelect.value}`);
    });
  }

  private buildUploadArea(kbContent: HTMLElement) {
    const uploadArea = kbContent.createDiv("ra-upload-area");
    uploadArea.createDiv({
      text: "Drop files or click to upload (.md · .pdf · images)",
      cls: "ra-upload-label",
    });
    const fileInput = uploadArea.createEl("input", {
      cls: "ra-hidden",
      attr: {
        type: "file",
        accept: ".md,.txt,.pdf,.png,.jpg,.jpeg,.webp,.gif",
        multiple: "true",
      },
    });

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.addClass("ra-drag-over");
    });
    uploadArea.addEventListener("dragleave", () => uploadArea.removeClass("ra-drag-over"));
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.removeClass("ra-drag-over");
      if (e.dataTransfer?.files) void this.handleUpload(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files) void this.handleUpload(Array.from(fileInput.files));
      fileInput.value = "";
    });
  }

  private updateActiveFileUI() {
    if (!this.activeFileEl) return;
    const activeFile = this.app.workspace.getActiveFile();
    this.activeFileEl.empty();
    if (activeFile && (activeFile.extension === "md" || activeFile.extension === "txt")) {
      this.activeFileEl.createSpan({ text: "Auto-including current file: ", cls: "ra-active-file-label" });
      this.activeFileEl.createEl("strong", { text: activeFile.basename });
    } else {
      this.activeFileEl.createSpan({ text: "No active markdown file to auto-include.", cls: "ra-active-file-none" });
    }
  }

  private async getDocumentsWithActiveFile(): Promise<IndexedDocument[]> {
    const activeFile = this.app.workspace.getActiveFile();
    const currentDocs = [...this.documents];

    if (activeFile && (activeFile.extension === "md" || activeFile.extension === "txt")) {
      // Skip if the user already added it explicitly.
      if (!currentDocs.some((d) => d.source === "vault" && d.name === activeFile.path)) {
        try {
          currentDocs.push({
            name: activeFile.path,
            content: await this.app.vault.cachedRead(activeFile),
            source: "vault",
          });
        } catch (e) {
          console.warn("Multi-AI Assistant: failed to read active file for auto-inclusion", e);
        }
      }
    }
    return currentDocs;
  }

  // ════════════════════════════════════════════════════════
  // Home page
  // ════════════════════════════════════════════════════════

  private buildHomePage(root: HTMLElement) {
    const page = root.createDiv("ra-page ra-home");
    page.createEl("p", { text: "What would you like to do?", cls: "ra-home-label" });

    const grid = page.createDiv("ra-mode-grid");
    this.modeCard(grid, "💬", "Chat", "Ask anything about your notes", () => this.setMode("chat"));
    this.modeCard(grid, "❓", "Quiz", "Test your knowledge", () => void this.startQuiz());
    this.modeCard(grid, "🃏", "Flash cards", "Review key concepts", () => void this.startFlashcards());
    this.modeCard(grid, "📓", "NotebookLM", "Use official NotebookLM", () => this.setMode("notebooklm"));
  }

  private async switchCharacter(char: Character) {
    this.plugin.settings.assistantPhotoFilename = char.spriteFile;
    this.plugin.settings.assistantName = char.name;
    await this.plugin.saveSettings();
    this.catSrc = this.getSpriteSrc(char.spriteFile);
    this.render();
  }

  private modeCard(parent: HTMLElement, emoji: string, title: string, desc: string, onClick: () => void) {
    const card = parent.createDiv("ra-mode-card");
    card.createDiv({ text: emoji, cls: "ra-mode-emoji" });
    card.createDiv({ text: title, cls: "ra-mode-title" });
    card.createDiv({ text: desc, cls: "ra-mode-desc" });
    card.addEventListener("click", onClick);
  }

  // ════════════════════════════════════════════════════════
  // Chat page
  // ════════════════════════════════════════════════════════

  private buildChatPage(root: HTMLElement) {
    this.chatEl = root.createDiv("ra-chat");
    const char = getCharacterBySprite(this.plugin.settings.assistantPhotoFilename || DEFAULT_SPRITE);
    void this.appendCatMsg(char.greeting);

    const bar = root.createDiv("ra-input-bar");
    this.chatInput = bar.createEl("textarea", {
      cls: "ra-input",
      attr: { placeholder: `Ask ${char.name}…`, rows: "1" },
    });
    this.chatInput.addEventListener("input", () => this.autoGrow(this.chatInput));
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submitChat();
      }
    });
    this.sendBtn = bar.createEl("button", { cls: "ra-send-btn", attr: { "aria-label": "Send" } });
    setIcon(this.sendBtn, "send");
    this.sendBtn.addEventListener("click", () => void this.submitChat());
  }

  private async submitChat() {
    const q = this.chatInput.value.trim();
    if (!q) return;
    this.appendUserMsg(q);
    this.chatInput.value = "";
    this.autoGrow(this.chatInput);
    this.sendBtn.disabled = true;

    const thinkingRow = await this.appendCatMsg("", true);
    const bubble = thinkingRow.querySelector<HTMLElement>(".ra-bubble");
    const actions = thinkingRow.querySelector<HTMLElement>(".ra-msg-actions");
    if (!bubble) return;
    actions?.addClass("ra-hidden");

    let fullAnswer = "";
    try {
      const currentDocs = await this.getDocumentsWithActiveFile();

      const answer = await this.plugin.aiService.ask(q, currentDocs, (chunk) => {
        if (fullAnswer === "") {
          bubble.removeClass("ra-bubble--thinking");
          bubble.empty();
        }
        fullAnswer += chunk;
        // Plain text while streaming; the markdown pass runs once at the end so
        // we are not re-parsing the whole answer on every token.
        bubble.setText(fullAnswer);
        this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "auto" });
      });

      bubble.removeClass("ra-bubble--thinking");
      bubble.empty();
      await this.renderMarkdownInto(bubble, answer);
      if (actions) {
        actions.removeClass("ra-hidden");
        this.refreshMsgActions(thinkingRow, answer);
      }
    } catch (e) {
      bubble.removeClass("ra-bubble--thinking");
      bubble.setText(this.friendlyError(e));
    } finally {
      this.sendBtn.disabled = false;
      this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "smooth" });
    }
  }

  private async renderMarkdownInto(el: HTMLElement, markdown: string) {
    const wrapper = el.createDiv("ra-markdown");
    await MarkdownRenderer.render(this.app, markdown, wrapper, "", this);
  }

  private refreshMsgActions(row: HTMLElement, text: string) {
    const actions = row.querySelector<HTMLElement>(".ra-msg-actions");
    if (!actions) return;
    actions.empty();
    const col = row.querySelector<HTMLElement>(".ra-msg-col");
    this.buildMsgActions(actions, col, text);
  }

  private buildMsgActions(actions: HTMLElement, col: HTMLElement | null, text: string) {
    const copyBtn = actions.createEl("button", { cls: "ra-icon-btn", attr: { "aria-label": "Copy to clipboard" } });
    setIcon(copyBtn, "copy");
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(text);
      new Notice("Copied to clipboard");
    });

    if (!col) return;
    const saveBtn = actions.createEl("button", { text: "Save as note", cls: "ra-action-btn" });
    saveBtn.addEventListener("click", () => this.saveAsNote(text, col));

    const appendBtn = actions.createEl("button", { text: "Append to note", cls: "ra-action-btn" });
    appendBtn.addEventListener("click", () => this.showAppendPicker(text, col));
  }

  // ════════════════════════════════════════════════════════
  // Quiz page
  // ════════════════════════════════════════════════════════

  private async startQuiz() {
    const currentDocs = await this.getDocumentsWithActiveFile();
    if (currentDocs.length === 0) { new Notice("Add some notes or open a file first."); return; }
    this.quizQuestions = []; this.quizIndex = 0; this.quizScore = 0; this.quizAnswered = false;
    this.quizStarted = false;
    this.setMode("quiz");
  }

  private buildQuizPage(root: HTMLElement) {
    const page = root.createDiv("ra-page ra-quiz-page");

    if (!this.quizStarted) {
      this.buildQuizSetup(page);
      return;
    }

    if (this.quizQuestions.length === 0) {
      page.createDiv({ text: "Generating quiz…", cls: "ra-center-msg" });
      page.createDiv({ cls: "ra-spinner" });
      void this.generateQuiz(page);
      return;
    }

    if (this.quizIndex >= this.quizQuestions.length) {
      this.buildQuizResults(page);
      return;
    }

    const q = this.quizQuestions[this.quizIndex];

    // Progress bar
    const progWrap = page.createDiv("ra-progress-wrap");
    progWrap.createSpan({
      text: `Question ${this.quizIndex + 1} / ${this.quizQuestions.length}`,
      cls: "ra-progress-label",
    });
    progWrap.createSpan({ text: `Score: ${this.quizScore}`, cls: "ra-progress-score" });
    const bar = progWrap.createDiv("ra-progress-bar");
    bar.createDiv("ra-progress-fill").setCssProps({
      "--ra-progress-fill": `${(this.quizIndex / this.quizQuestions.length) * 100}%`,
    });

    page.createDiv("ra-quiz-question").setText(q.question);

    const answerWrap = page.createDiv("ra-quiz-answer-wrap");

    if (q.options && q.options.length > 0) {
      const optionsContainer = answerWrap.createDiv("ra-quiz-options");
      q.options.forEach((opt, idx) => {
        const letter = String.fromCharCode(65 + idx); // A, B, C, D
        const optBtn = optionsContainer.createEl("button", {
          cls: "ra-quiz-option-btn",
          text: `${letter}) ${opt}`,
        });
        if (this.quizAnswered) optBtn.disabled = true;
        optBtn.addEventListener("click", () => void this.submitQuizAnswer(opt));
      });
    } else {
      const answerInput = answerWrap.createEl("textarea", {
        cls: "ra-quiz-answer-input",
        attr: { placeholder: "Type your answer…", rows: "3" },
      });
      answerInput.addEventListener("keydown", (e) => e.stopPropagation());

      const submitBtn = answerWrap.createEl("button", { text: "Submit answer", cls: "ra-btn ra-btn-accent" });
      if (this.quizAnswered) {
        answerInput.disabled = true;
        submitBtn.disabled = true;
      }
      submitBtn.addEventListener("click", () => void this.submitQuizAnswer(answerInput.value.trim()));
    }

    page.createDiv("ra-quiz-feedback ra-hidden");
  }

  private async submitQuizAnswer(userAns: string) {
    if (!userAns || this.quizAnswered) return;

    const q = this.quizQuestions[this.quizIndex];
    this.quizAnswered = true;
    this.render(); // redraw to disable the inputs

    const root = this.containerEl.children[1] as HTMLElement;
    const feedbackEl = root.querySelector<HTMLElement>(".ra-quiz-feedback");
    if (!feedbackEl) return;
    feedbackEl.removeClass("ra-hidden");

    const isMCQ = q.options && q.options.length > 0;

    if (isMCQ) {
      // Direct comparison — no AI call needed.
      const correct = userAns.trim().toLowerCase() === q.answer.trim().toLowerCase();
      if (correct) this.quizScore++;
      this.renderQuizFeedback(feedbackEl, correct, null, q.answer);
      this.appendQuizNextButton(root);
    } else {
      feedbackEl.setText("Checking…");
      try {
        const result = await this.plugin.aiService.evaluateAnswer(q.question, q.answer, userAns);
        if (result.correct) this.quizScore++;
        this.renderQuizFeedback(feedbackEl, result.correct, result.feedback, q.answer);
        this.appendQuizNextButton(root);
      } catch (e) {
        this.quizAnswered = false;
        this.render();
        new Notice(this.friendlyError(e));
      }
    }
  }

  private renderQuizFeedback(el: HTMLElement, correct: boolean, feedback: string | null, modelAnswer: string) {
    el.empty();
    el.addClass(correct ? "ra-quiz-feedback--correct" : "ra-quiz-feedback--wrong");
    el.createEl("strong", { text: correct ? "✓ Correct!" : "✗ Not quite" });
    if (feedback) {
      el.createEl("br");
      el.appendText(feedback);
    }
    el.createEl("br");
    el.createEl("em", { text: `${feedback ? "Model answer" : "Answer"}: ${modelAnswer}` });
  }

  private appendQuizNextButton(root: HTMLElement) {
    const page = root.querySelector<HTMLElement>(".ra-quiz-page");
    if (!page) return;
    const isLast = this.quizIndex + 1 >= this.quizQuestions.length;
    const nextBtn = page.createEl("button", {
      text: isLast ? "See results" : "Next →",
      cls: "ra-btn ra-btn-accent ra-quiz-next",
    });
    nextBtn.addEventListener("click", () => {
      this.quizIndex++;
      this.quizAnswered = false;
      this.render();
    });
  }

  private buildQuizSetup(page: HTMLElement) {
    this.countDropdown(page, "Count", ["5", "10", "15", "20", "30"], "questions",
      this.plugin.settings.quizCount || 5,
      (n) => { this.plugin.settings.quizCount = n; });

    this.settingDropdown(page, "Type",
      [["mcq", "Multiple choice"], ["short", "Short answer"], ["subjective", "Subjective"]],
      this.plugin.settings.quizType,
      (v) => { this.plugin.settings.quizType = v as MultiAIAssistantSettings["quizType"]; });

    this.settingDropdown(page, "Difficulty",
      [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]],
      this.plugin.settings.quizDifficulty,
      (v) => { this.plugin.settings.quizDifficulty = v; });

    this.settingDropdown(page, "Language",
      [["both", "English and Korean"], ["english", "English only"], ["korean", "Korean only"]],
      this.plugin.settings.quizLanguage,
      (v) => { this.plugin.settings.quizLanguage = v as MultiAIAssistantSettings["quizLanguage"]; });

    this.buildSetupButtons(page, "Start quiz", () => { this.quizStarted = true; this.render(); });
  }

  private buildQuizResults(page: HTMLElement) {
    const pct = Math.round((this.quizScore / this.quizQuestions.length) * 100);
    page.createDiv({ text: "Quiz complete!", cls: "ra-result-title" });
    page.createDiv({ text: `${this.quizScore} / ${this.quizQuestions.length}`, cls: "ra-result-score" });
    page.createDiv({ text: `${pct}%`, cls: "ra-result-pct" });
    const msg = pct >= 80 ? "Excellent work! 🎉" : pct >= 60 ? "Good effort! Keep reviewing." : "Keep studying — you'll get there!";
    page.createDiv({ text: msg, cls: "ra-result-msg" });

    const btnRow = page.createDiv("ra-result-btns");
    const saveBtn = btnRow.createEl("button", { text: "Save results", cls: "ra-btn ra-btn-accent" });
    saveBtn.addEventListener("click", () => void this.saveQuizResults());

    const retryBtn = btnRow.createEl("button", { text: "Retry", cls: "ra-btn" });
    retryBtn.addEventListener("click", () => {
      this.quizQuestions = []; this.quizIndex = 0; this.quizScore = 0; this.render();
    });

    const homeBtn = btnRow.createEl("button", { text: "Home", cls: "ra-btn" });
    homeBtn.addEventListener("click", () => this.setMode("home"));
  }

  private async saveQuizResults() {
    if (this.quizQuestions.length === 0) return;

    const pct = Math.round((this.quizScore / this.quizQuestions.length) * 100);
    let content = `# Quiz results: ${new Date().toLocaleString()}\n\n`;
    content += `**Score:** ${this.quizScore} / ${this.quizQuestions.length} (${pct}%)\n\n---\n\n`;
    this.quizQuestions.forEach((q, i) => {
      content += `### Q${i + 1}: ${q.question}\n`;
      content += `**Model answer:** ${q.answer}\n\n`;
    });

    const fileName = `Quiz-Results-${Date.now()}.md`;
    try {
      await this.app.vault.create(fileName, content);
      new Notice(`Saved results to ${fileName}`);
    } catch (e) {
      new Notice("Failed to save quiz results: " + (e as Error).message);
    }
  }

  private async generateQuiz(page: HTMLElement) {
    try {
      const currentDocs = await this.getDocumentsWithActiveFile();
      this.quizQuestions = await this.plugin.aiService.generateQuiz(currentDocs);
      this.quizIndex = 0; this.quizScore = 0; this.quizAnswered = false;
      this.render();
    } catch (e) {
      this.renderPageError(page, e);
    }
  }

  // ════════════════════════════════════════════════════════
  // Flashcards page
  // ════════════════════════════════════════════════════════

  private async startFlashcards() {
    const currentDocs = await this.getDocumentsWithActiveFile();
    if (currentDocs.length === 0) { new Notice("Add some notes or open a file first."); return; }
    this.flashcards = []; this.cardIndex = 0; this.cardFlipped = false; this.cardKnown = [];
    this.flashcardsStarted = false;
    this.setMode("flashcards");
  }

  private buildFlashcardsPage(root: HTMLElement) {
    const page = root.createDiv("ra-page ra-flash-page");

    if (!this.flashcardsStarted) {
      this.buildFlashcardsSetup(page);
      return;
    }

    if (this.flashcards.length === 0) {
      page.createDiv({ text: "Generating flashcards…", cls: "ra-center-msg" });
      page.createDiv({ cls: "ra-spinner" });
      void this.generateFlashcards(page);
      return;
    }

    if (this.cardIndex >= this.flashcards.length) {
      this.buildFlashcardsResults(page);
      return;
    }

    const card = this.flashcards[this.cardIndex];
    const known = this.cardKnown.filter(Boolean).length;

    const progWrap = page.createDiv("ra-progress-wrap");
    progWrap.createSpan({ text: `${this.cardIndex + 1} / ${this.flashcards.length}`, cls: "ra-progress-label" });
    progWrap.createSpan({ text: `✓ ${known}`, cls: "ra-progress-score" });
    const bar = progWrap.createDiv("ra-progress-bar");
    bar.createDiv("ra-progress-fill").setCssProps({
      "--ra-progress-fill": `${(this.cardIndex / this.flashcards.length) * 100}%`,
    });

    const cardEl = page.createDiv("ra-flashcard" + (this.cardFlipped ? " ra-flashcard--flipped" : ""));
    const front = cardEl.createDiv("ra-flashcard-front");
    front.createDiv({ text: "TERM", cls: "ra-flashcard-side-label" });
    front.createDiv({ text: card.front, cls: "ra-flashcard-text" });

    const back = cardEl.createDiv("ra-flashcard-back");
    back.createDiv({ text: "DEFINITION", cls: "ra-flashcard-side-label" });
    back.createDiv({ text: card.back, cls: "ra-flashcard-text" });

    if (!this.cardFlipped) {
      cardEl.addEventListener("click", () => { this.cardFlipped = true; this.render(); });
      return;
    }

    const btnRow = page.createDiv("ra-flash-btn-row");
    const dontKnow = btnRow.createEl("button", { text: "✗ Still learning", cls: "ra-btn ra-btn-wrong" });
    const doKnow = btnRow.createEl("button", { text: "✓ Got it!", cls: "ra-btn ra-btn-correct" });
    const advance = (wasKnown: boolean) => {
      this.cardKnown.push(wasKnown);
      this.cardIndex++;
      this.cardFlipped = false;
      this.render();
    };
    dontKnow.addEventListener("click", () => advance(false));
    doKnow.addEventListener("click", () => advance(true));
  }

  private buildFlashcardsSetup(page: HTMLElement) {
    this.countDropdown(page, "Count", ["5", "10", "15", "20", "30", "50"], "cards",
      this.plugin.settings.flashcardCount || 10,
      (n) => { this.plugin.settings.flashcardCount = n; });

    this.settingDropdown(page, "Difficulty",
      [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]],
      this.plugin.settings.flashcardDifficulty,
      (v) => { this.plugin.settings.flashcardDifficulty = v; });

    this.settingDropdown(page, "Language",
      [["both", "English and Korean"], ["english", "English only"], ["korean", "Korean only"]],
      this.plugin.settings.flashcardLanguage,
      (v) => { this.plugin.settings.flashcardLanguage = v as MultiAIAssistantSettings["flashcardLanguage"]; });

    this.buildSetupButtons(page, "Start review", () => { this.flashcardsStarted = true; this.render(); });
  }

  private buildFlashcardsResults(page: HTMLElement) {
    const known = this.cardKnown.filter(Boolean).length;
    const pct = Math.round((known / this.flashcards.length) * 100);
    page.createDiv({ text: "Session complete!", cls: "ra-result-title" });
    page.createDiv({ text: `${known} / ${this.flashcards.length} known`, cls: "ra-result-score" });
    page.createDiv({ text: `${pct}%`, cls: "ra-result-pct" });
    const msg = pct >= 80 ? "You're mastering this! 🎉" : pct >= 60 ? "Good progress — keep it up!" : "Review more and try again!";
    page.createDiv({ text: msg, cls: "ra-result-msg" });

    const btnRow = page.createDiv("ra-result-btns");
    const retryBtn = btnRow.createEl("button", { text: "New cards", cls: "ra-btn ra-btn-accent" });
    retryBtn.addEventListener("click", () => {
      this.flashcards = []; this.cardIndex = 0; this.cardFlipped = false; this.cardKnown = []; this.render();
    });
    const homeBtn = btnRow.createEl("button", { text: "Home", cls: "ra-btn" });
    homeBtn.addEventListener("click", () => this.setMode("home"));
  }

  private async generateFlashcards(page: HTMLElement) {
    try {
      const currentDocs = await this.getDocumentsWithActiveFile();
      this.flashcards = await this.plugin.aiService.generateFlashcards(currentDocs);
      this.cardIndex = 0; this.cardFlipped = false; this.cardKnown = [];
      this.render();
    } catch (e) {
      this.renderPageError(page, e);
    }
  }

  // ════════════════════════════════════════════════════════
  // NotebookLM page
  // ════════════════════════════════════════════════════════

  private buildNotebookLMPage(root: HTMLElement) {
    const page = root.createDiv("ra-page ra-notebooklm-page");

    if (Platform.isDesktop) {
      // Desktop only: Obsidian mobile blocks embedding third-party sites.
      page.createEl("iframe", {
        cls: "ra-notebooklm-frame",
        attr: { src: NOTEBOOKLM_URL, allow: "clipboard-read; clipboard-write" },
      });
      return;
    }

    const wrap = page.createDiv("ra-notebooklm-mobile");
    wrap.createDiv({ text: "📓", cls: "ra-notebooklm-emoji" });
    wrap.createDiv({ text: "NotebookLM", cls: "ra-notebooklm-title" });
    wrap.createDiv({
      text: "NotebookLM cannot be embedded on mobile. Tap below to open it in your browser.",
      cls: "ra-home-label",
    });
    const openBtn = wrap.createEl("button", { text: "Open NotebookLM", cls: "ra-btn ra-btn-accent" });
    openBtn.addEventListener("click", () => window.open(NOTEBOOKLM_URL, "_blank"));
  }

  // ════════════════════════════════════════════════════════
  // Shared page helpers
  // ════════════════════════════════════════════════════════

  private settingDropdown(
    page: HTMLElement,
    name: string,
    options: [string, string][],
    current: string,
    apply: (value: string) => void
  ) {
    new Setting(page).setName(name).addDropdown((drop) => {
      for (const [value, label] of options) drop.addOption(value, label);
      drop.setValue(current).onChange(async (value) => {
        apply(value);
        await this.plugin.saveSettings();
      });
    });
  }

  private countDropdown(
    page: HTMLElement,
    name: string,
    counts: string[],
    noun: string,
    current: number,
    apply: (value: number) => void
  ) {
    this.settingDropdown(
      page,
      name,
      counts.map((c): [string, string] => [c, `${c} ${noun}`]),
      String(current),
      (value) => apply(parseInt(value, 10))
    );
  }

  private buildSetupButtons(page: HTMLElement, startLabel: string, onStart: () => void) {
    const btnRow = page.createDiv("ra-setup-btns");
    const startBtn = btnRow.createEl("button", { text: startLabel, cls: "ra-btn ra-btn-accent" });
    startBtn.addEventListener("click", onStart);
    const backBtn = btnRow.createEl("button", { text: "Back", cls: "ra-btn" });
    backBtn.addEventListener("click", () => this.setMode("home"));
  }

  private renderPageError(page: HTMLElement, e: unknown) {
    page.empty();
    page.createDiv({ text: this.friendlyError(e), cls: "ra-center-msg ra-error" });
    const back = page.createEl("button", { text: "← Back", cls: "ra-btn" });
    back.addEventListener("click", () => this.setMode("home"));
  }

  // ════════════════════════════════════════════════════════
  // Chat helpers
  // ════════════════════════════════════════════════════════

  private appendUserMsg(text: string): HTMLElement {
    const row = this.chatEl.createDiv("ra-row ra-row--user");
    row.createDiv("ra-bubble ra-bubble--user").setText(text);
    this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "smooth" });
    return row;
  }

  private async appendCatMsg(text: string, isThinking = false): Promise<HTMLElement> {
    const row = this.chatEl.createDiv("ra-row ra-row--cat");
    if (this.catSrc) {
      row.createEl("img", { cls: "ra-avatar", attr: { src: this.catSrc, alt: "" } });
    }
    const col = row.createDiv("ra-msg-col");
    const bubble = col.createDiv("ra-bubble ra-bubble--cat");

    if (isThinking) {
      bubble.addClass("ra-bubble--thinking");
      for (let i = 0; i < 3; i++) bubble.createSpan({ cls: "ra-dot" });
      col.createDiv("ra-msg-actions"); // populated by refreshMsgActions once streaming finishes
    } else {
      await this.renderMarkdownInto(bubble, text);
      this.buildMsgActions(col.createDiv("ra-msg-actions"), col, text);
    }

    this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "smooth" });
    return row;
  }

  private friendlyError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("API_KEY") || msg.includes("key")) return "No valid API key — check Settings → Multi-AI Assistant.";
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) return "Quota hit — try again in a minute or switch models in Settings.";
    if (msg.includes("No documents")) return "Add some notes or files first using the panel above.";
    return `Error: ${msg}`;
  }

  // ════════════════════════════════════════════════════════
  // Save / append
  // ════════════════════════════════════════════════════════

  private saveAsNote(content: string, container: HTMLElement) {
    container.querySelector(".ra-save-form")?.remove();
    const form = container.createDiv("ra-save-form");
    const input = form.createEl("input", {
      cls: "ra-save-input",
      attr: { placeholder: "e.g. Research/summary.md", type: "text" },
    });
    const btnRow = form.createDiv("ra-save-btn-row");
    const ok = btnRow.createEl("button", { text: "Create", cls: "ra-action-btn ra-action-btn--accent" });
    const cancel = btnRow.createEl("button", { text: "Cancel", cls: "ra-action-btn" });
    input.focus();

    const doSave = async () => {
      let path = input.value.trim();
      if (!path) return;
      if (!path.endsWith(".md")) path += ".md";
      try {
        if (this.app.vault.getAbstractFileByPath(path)) {
          new Notice(`Already exists: ${path}`);
          return;
        }
        await this.app.vault.create(path, content);
        new Notice(`Created: ${path}`);
        form.remove();
      } catch (e) {
        new Notice("Failed: " + (e as Error).message);
      }
    };

    ok.addEventListener("click", () => void doSave());
    cancel.addEventListener("click", () => form.remove());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") void doSave();
      if (e.key === "Escape") form.remove();
    });
  }

  private showAppendPicker(content: string, container: HTMLElement) {
    container.querySelector(".ra-save-form")?.remove();
    const form = container.createDiv("ra-save-form");
    const sw = form.createDiv("ra-search-wrap");
    const inp = sw.createEl("input", {
      cls: "ra-save-input",
      attr: { placeholder: "Search note to append to…", type: "text" },
    });
    const dd = sw.createDiv("ra-dropdown ra-hidden");
    const cancel = form.createEl("button", { text: "Cancel", cls: "ra-action-btn" });
    cancel.addEventListener("click", () => form.remove());

    const appendTo = async (file: TFile) => {
      try {
        await this.app.vault.process(file, (data) => `${data}\n\n---\n\n${content}`);
        new Notice(`Appended to: ${file.path}`);
        form.remove();
      } catch (err) {
        new Notice("Failed: " + (err as Error).message);
      }
    };

    const search = () => {
      const q = inp.value.trim().toLowerCase();
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !q || f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
        .slice(0, 8);
      dd.empty();
      if (!files.length) {
        dd.addClass("ra-hidden");
        return;
      }
      for (const file of files) {
        const item = dd.createDiv("ra-dropdown-item");
        item.createDiv("ra-dropdown-item-top").createSpan({
          text: "📄 " + file.basename,
          cls: "ra-dropdown-name",
        });
        item.createSpan({ text: file.path, cls: "ra-dropdown-path" });
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          void appendTo(file);
        });
      }
      dd.removeClass("ra-hidden");
    };

    inp.addEventListener("input", search);
    inp.addEventListener("focus", search);
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    inp.focus();
  }

  // ════════════════════════════════════════════════════════
  // KB search / dropdown
  // ════════════════════════════════════════════════════════

  private getVaultReadableFiles(): TFile[] {
    return this.app.vault.getFiles().filter((f) => READABLE_EXTENSIONS.includes(f.extension.toLowerCase()));
  }

  private onSearchInput() {
    const query = this.searchInput.value.trim().toLowerCase();
    const allFiles = this.getVaultReadableFiles();

    const folderPaths = new Map<string, TFolder>();
    for (const f of allFiles) {
      let folder = f.parent;
      while (folder && folder.path !== "/") {
        if (!folderPaths.has(folder.path)) folderPaths.set(folder.path, folder);
        folder = folder.parent;
      }
    }

    const addedNotePaths = new Set(
      this.documents.filter((d) => d.source === "vault" && !d.name.endsWith("/")).map((d) => d.name)
    );
    const addedFolderPaths = new Set(
      this.documents.filter((d) => d.source === "vault" && d.name.endsWith("/")).map((d) => d.name)
    );
    const results: DropdownResult[] = [];
    const countIn = (folder: TFolder) => allFiles.filter((f) => f.path.startsWith(folder.path + "/")).length;

    if (!query) {
      folderPaths.forEach((folder) => {
        if ((!folder.parent || folder.parent.path === "/") && !addedFolderPaths.has(folder.path + "/")) {
          results.push({ type: "folder", folder, count: countIn(folder) });
        }
      });
      allFiles
        .filter((f) => !addedNotePaths.has(f.path))
        .slice(0, 6)
        .forEach((f) => results.push({ type: "note", file: f }));
    } else {
      folderPaths.forEach((folder) => {
        if (folder.path.toLowerCase().includes(query) && !addedFolderPaths.has(folder.path + "/")) {
          results.push({ type: "folder", folder, count: countIn(folder) });
        }
      });
      allFiles
        .filter(
          (f) =>
            (f.path.toLowerCase().includes(query) || f.basename.toLowerCase().includes(query)) &&
            !addedNotePaths.has(f.path)
        )
        .forEach((f) => results.push({ type: "note", file: f }));
    }

    this.currentResults = results.slice(0, 12);
    this.renderDropdown(this.currentResults);
  }

  private renderDropdown(results: DropdownResult[]) {
    this.dropdownEl.empty();
    this.focusedIndex = -1;
    if (!results.length) {
      this.hideDropdown();
      return;
    }

    results.forEach((result, i) => {
      const item = this.dropdownEl.createDiv("ra-dropdown-item");
      if (result.type === "folder") {
        item.addClass("ra-dropdown-item--folder");
        const top = item.createDiv("ra-dropdown-item-top");
        top.createSpan({ text: "📁", cls: "ra-dropdown-icon" });
        top.createSpan({ text: result.folder.name, cls: "ra-dropdown-name" });
        top.createSpan({ text: `${result.count} files`, cls: "ra-dropdown-badge" });
        item.createSpan({ text: result.folder.path, cls: "ra-dropdown-path" });
      } else {
        const ext = result.file.extension.toLowerCase();
        const isPDF = ext === "pdf";
        const isImg = IMAGE_EXTENSIONS.includes(ext);

        const top = item.createDiv("ra-dropdown-item-top");
        top.createSpan({ text: isPDF ? "📕" : isImg ? "🖼️" : "📄", cls: "ra-dropdown-icon" });
        top.createSpan({ text: result.file.basename, cls: "ra-dropdown-name" });
        if (isPDF) top.createSpan({ text: "PDF", cls: "ra-dropdown-badge" });
        if (isImg) top.createSpan({ text: "IMG", cls: "ra-dropdown-badge" });
        item.createSpan({ text: result.file.path, cls: "ra-dropdown-path" });
      }
      item.addEventListener("mouseenter", () => this.setFocusedIndex(i));
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        void this.selectResult(result);
      });
    });

    this.showDropdown();
  }

  private onSearchKeydown(e: KeyboardEvent) {
    const items = this.dropdownEl.querySelectorAll(".ra-dropdown-item");
    if (!this.dropdownVisible || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setFocusedIndex(Math.min(this.focusedIndex + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.setFocusedIndex(Math.max(this.focusedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = this.currentResults[this.focusedIndex];
      if (result) void this.selectResult(result);
    } else if (e.key === "Escape") {
      this.hideDropdown();
    }
  }

  private setFocusedIndex(i: number) {
    const items = this.dropdownEl.querySelectorAll<HTMLElement>(".ra-dropdown-item");
    items.forEach((el) => el.removeClass("ra-dropdown-item--focused"));
    this.focusedIndex = i;
    items[i]?.addClass("ra-dropdown-item--focused");
  }

  private showDropdown() {
    this.dropdownEl.removeClass("ra-hidden");
    this.dropdownVisible = true;
  }

  private hideDropdown() {
    this.dropdownEl?.addClass("ra-hidden");
    this.dropdownVisible = false;
    this.focusedIndex = -1;
  }

  private async selectResult(result: DropdownResult) {
    this.hideDropdown();
    this.searchInput.value = "";
    if (result.type === "note") await this.addVaultNote(result.file);
    else await this.addFolder(result.folder);
  }

  private async addVaultNote(file: TFile) {
    if (this.documents.some((d) => d.source === "vault" && d.name === file.path)) {
      new Notice(`Already added: ${file.basename}`);
      return;
    }
    try {
      const ext = file.extension.toLowerCase();
      let doc: IndexedDocument;

      if (ext === "pdf") {
        doc = await this.processor.readVaultPDF(file);
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        doc = await this.processor.readVaultImage(file);
      } else {
        doc = { name: file.path, content: await this.app.vault.cachedRead(file), source: "vault" };
      }

      this.documents.push(doc);
      this.refreshSources();
    } catch (e) {
      new Notice(`Could not read ${file.basename}: ${(e as Error).message}`);
    }
  }

  private async addFolder(folder: TFolder) {
    const key = folder.path + "/";
    if (this.documents.some((d) => d.source === "vault" && d.name === key)) {
      new Notice(`Already added: ${folder.name}`);
      return;
    }
    const files = this.getVaultReadableFiles().filter((f) => f.path.startsWith(folder.path + "/"));
    if (!files.length) {
      new Notice(`No readable files in ${folder.name}`);
      return;
    }

    const parts: string[] = [];
    for (const file of files) {
      try {
        const text = file.extension.toLowerCase() === "pdf"
          ? (await this.processor.readVaultPDF(file)).content
          : await this.app.vault.cachedRead(file);
        parts.push(`### ${file.basename}\n${text}`);
      } catch (e) {
        console.warn(`Multi-AI Assistant: skipping unreadable file ${file.path}`, e);
      }
    }

    this.documents.push({ name: key, content: parts.join("\n\n---\n\n"), source: "vault" });
    new Notice(`Added folder: ${folder.name} (${files.length} files)`);
    this.refreshSources();
  }

  private async handleUpload(files: File[]) {
    for (const file of files) {
      try {
        const doc = await this.processor.processUploadedFile(file);
        this.documents = this.documents.filter((d) => !(d.source === "upload" && d.name === doc.name));
        this.documents.push(doc);
        new Notice(`Uploaded: ${file.name}`);
      } catch (e) {
        new Notice(`Error: ${(e as Error).message}`);
      }
    }
    this.refreshSources();
  }

  private refreshSources() {
    if (!this.sourceChipsEl) return;
    this.sourceChipsEl.empty();

    const tokens = this.plugin.aiService.estimateTokenCount(this.documents);
    if (this.tokenCountEl) {
      this.tokenCountEl.setText(
        tokens > 0 ? `~${tokens.toLocaleString()} tokens · ${this.documents.length} sources` : ""
      );
    }

    for (const doc of this.documents) {
      const chip = this.sourceChipsEl.createDiv("ra-chip");
      let icon = "◈";
      if (doc.source === "upload") icon = "↑";
      else if (doc.name.endsWith("/")) icon = "📁";
      if (doc.imageData) icon = "🖼️";

      const label = doc.name.endsWith("/")
        ? doc.name.slice(0, -1).split("/").pop() ?? doc.name
        : doc.name.split("/").pop() ?? doc.name;

      chip.createSpan({ text: `${icon} ${label}`, cls: "ra-chip-label", attr: { title: doc.name } });
      const remove = chip.createEl("button", { text: "×", cls: "ra-chip-remove", attr: { "aria-label": "Remove source" } });
      remove.addEventListener("click", () => {
        this.documents = this.documents.filter((d) => d !== doc);
        this.refreshSources();
      });
    }
  }
}
