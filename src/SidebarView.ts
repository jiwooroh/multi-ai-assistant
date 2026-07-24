import { ItemView, WorkspaceLeaf, TFile, TFolder, Notice, Setting, Platform } from "obsidian";
import type MultiAIAssistantPlugin from "../main";
import type { IndexedDocument, QuizQuestion, Flashcard } from "./AIService";
import { FileProcessor } from "./FileProcessor";
import { MODELS, AIProvider } from "./SettingsTab";
import { CHARACTERS, Character, getCharacterBySprite } from "./characters";

export const VIEW_TYPE = "multi-ai-assistant-sidebar";

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
  private dropdownEl: HTMLElement;
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
    const pluginDir = (this.plugin.manifest as any).dir as string;
    const adapter = this.app.vault.adapter as any;
    return typeof adapter.getResourcePath === "function"
      ? adapter.getResourcePath(`${pluginDir}/${filename}`)
      : "";
  }

  async onOpen() {
    const photoFile = this.plugin.settings.assistantPhotoFilename || "sprite-pixel.png";
    this.catSrc = this.getSpriteSrc(photoFile);
    
    // Listen for file changes to update the "Current File" UI
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFileUI()));
    
    this.render();
  }

  async onClose() {}

  public async searchExternal(query: string) {
    this.setMode("chat");
    this.chatInput.value = query;
    this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + "px";
    await this.submitChat();
  }

  // ════════════════════════════════════════════════════════
  // Root render
  // ════════════════════════════════════════════════════════

  private render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("ra-root");
    this.buildHeader(root);
    this.buildKBPanel(root);
    if (this.mode === "home")        this.buildHomePage(root);
    else if (this.mode === "chat")   this.buildChatPage(root);
    else if (this.mode === "quiz")   this.buildQuizPage(root);
    else if (this.mode === "flashcards") this.buildFlashcardsPage(root);
    else if (this.mode === "notebooklm") this.buildNotebookLMPage(root);
  }

  private setMode(m: Mode) { this.mode = m; this.render(); }

  // ════════════════════════════════════════════════════════
  // Header
  // ════════════════════════════════════════════════════════

  private buildHeader(root: HTMLElement) {
    const header = root.createDiv("ra-header");
    if (this.catSrc) {
      const img = header.createEl("img", { cls: "ra-header-avatar" });
      img.src = this.catSrc;
    }
    const char = getCharacterBySprite(this.plugin.settings.assistantPhotoFilename || "sprite-pixel.png");
    const txt = header.createDiv("ra-header-text");
    txt.createEl("div", { text: char.englishTag, cls: "ra-header-korean" });
    txt.createEl("div", { text: char.name, cls: "ra-header-name" });
    txt.createEl("div", { text: char.personality, cls: "ra-header-sub" });

    const right = header.createDiv("ra-header-right");
    if (this.mode !== "home") {
      const homeBtn = right.createEl("button", { cls: "ra-icon-btn", attr: { title: "Home" } });
      homeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
      homeBtn.addEventListener("click", () => this.setMode("home"));
    }

    // Character picker button + dropdown
    const charPickerWrap = right.createDiv("ra-char-picker-wrap");
    const charBtn = charPickerWrap.createEl("button", { cls: "ra-icon-btn ra-char-pick-btn", attr: { title: "Switch Character" } });
    charBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

    const dropdown = charPickerWrap.createDiv("ra-char-pick-dropdown");
    dropdown.style.display = "none";

    const currentFile = this.plugin.settings.assistantPhotoFilename || "sprite-pixel.png";
    for (const c of CHARACTERS) {
      const item = dropdown.createDiv("ra-char-pick-item" + (c.spriteFile === currentFile ? " ra-char-pick-item--active" : ""));
      const img = item.createEl("img", { cls: "ra-char-pick-img" });
      img.src = this.getSpriteSrc(c.spriteFile);
      const text = item.createDiv("ra-char-pick-text");
      text.createEl("span", { text: c.name, cls: "ra-char-pick-name" });
      text.createEl("span", { text: c.englishTag, cls: "ra-char-pick-tag" });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dropdown.style.display = "none";
        this.switchCharacter(c);
      });
    }

    charBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== "none";
      dropdown.style.display = isOpen ? "none" : "block";
    });

    document.addEventListener("click", () => { dropdown.style.display = "none"; });

    const kbBtn = right.createEl("button", { cls: "ra-icon-btn", attr: { title: "Toggle Knowledge Base" } });
    kbBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
    kbBtn.addEventListener("click", () => {
      this.kbOpen = !this.kbOpen;
      this.kbBody.style.display = this.kbOpen ? "block" : "none";
    });
  }

  // ════════════════════════════════════════════════════════
  // KB panel (shared)
  // ════════════════════════════════════════════════════════

  private buildKBPanel(root: HTMLElement) {
    this.kbBody = root.createDiv("ra-kb-panel");
    this.kbBody.style.display = this.kbOpen ? "block" : "none";

    // Add folding header
    const kbHeader = this.kbBody.createDiv("ra-kb-header");
    const kbToggle = kbHeader.createDiv("ra-kb-toggle");
    kbToggle.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    kbHeader.createEl("span", { text: "Knowledge Base", cls: "ra-kb-title" });

    const kbContent = this.kbBody.createDiv("ra-kb-content");
    kbContent.style.display = this.kbContentOpen ? "block" : "none";
    kbToggle.style.transform = this.kbContentOpen ? "rotate(0deg)" : "rotate(-90deg)";

    kbHeader.addEventListener("click", () => {
      this.kbContentOpen = !this.kbContentOpen;
      kbContent.style.display = this.kbContentOpen ? "block" : "none";
      kbToggle.style.transform = this.kbContentOpen ? "rotate(0deg)" : "rotate(-90deg)";
    });

    // Provider & Model Selector
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
    const providers = Platform.isDesktop
      ? allProviders
      : allProviders.filter(p => p.value !== "gemini-cli" && p.value !== "claude-cli");

    providers.forEach(p => {
      const opt = providerSelect.createEl("option", { value: p.value, text: p.label });
      if (this.plugin.settings.provider === p.value) opt.selected = true;
    });

    const updateModelOptions = () => {
      modelSelect.empty();
      const currentProvider = providerSelect.value as AIProvider;
      const models = MODELS[currentProvider] || [];
      models.forEach(m => {
        const opt = modelSelect.createEl("option", { value: m.value, text: m.label });
        if (this.plugin.settings.model === m.value) opt.selected = true;
      });
    };

    updateModelOptions();

    providerSelect.addEventListener("change", async () => {
      const newProvider = providerSelect.value as AIProvider;
      this.plugin.settings.provider = newProvider;
      this.plugin.settings.model = MODELS[newProvider][0].value;
      updateModelOptions();
      await this.plugin.saveSettings();
      new Notice(`Switched to ${newProvider}`);
    });

    modelSelect.addEventListener("change", async () => {
      this.plugin.settings.model = modelSelect.value;
      await this.plugin.saveSettings();
      new Notice(`Model set to ${modelSelect.value}`);
    });

    // Current File Auto-Include Info
    this.activeFileEl = kbContent.createDiv("ra-active-file-info");
    this.updateActiveFileUI();

    const searchWrap = kbContent.createDiv("ra-search-wrap");
    this.searchInput = searchWrap.createEl("input", {
      cls: "ra-search-input",
      attr: { placeholder: "Add more notes or folders…", type: "text" },
    }) as HTMLInputElement;
    this.dropdownEl = searchWrap.createDiv("ra-dropdown");
    this.dropdownEl.style.display = "none";

    this.searchInput.addEventListener("input", () => this.onSearchInput());
    this.searchInput.addEventListener("focus", () => this.onSearchInput());
    this.searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.onSearchKeydown(e);
    });
    document.addEventListener("click", (e) => {
      if (!searchWrap.contains(e.target as Node)) this.hideDropdown();
    });

    this.tokenCountEl = kbContent.createEl("div", { text: "", cls: "ra-token-count" });
    this.sourceChipsEl = kbContent.createDiv("ra-source-chips");
    this.refreshSources();

    // Upload
    const uploadArea = kbContent.createDiv("ra-upload-area");
    uploadArea.createEl("div", { text: "Drop files or click to upload (.md · .pdf · images)", cls: "ra-upload-label" });
    const fileInput = uploadArea.createEl("input") as HTMLInputElement;
    fileInput.type = "file"; fileInput.accept = ".md,.txt,.pdf,.png,.jpg,.jpeg,.webp,.gif"; fileInput.multiple = true; fileInput.style.display = "none";
    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.addClass("ra-drag-over"); });
    uploadArea.addEventListener("dragleave", () => uploadArea.removeClass("ra-drag-over"));
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault(); uploadArea.removeClass("ra-drag-over");
      if (e.dataTransfer?.files) this.handleUpload(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files) this.handleUpload(Array.from(fileInput.files));
      fileInput.value = "";
    });
  }

  private updateActiveFileUI() {
    if (!this.activeFileEl) return;
    const activeFile = this.app.workspace.getActiveFile();
    this.activeFileEl.empty();
    if (activeFile && (activeFile.extension === "md" || activeFile.extension === "txt")) {
      this.activeFileEl.createEl("span", { text: "Auto-including current file: ", cls: "ra-active-file-label" });
      this.activeFileEl.createEl("strong", { text: activeFile.basename });
    } else {
      this.activeFileEl.createEl("span", { text: "No active markdown file to auto-include.", cls: "ra-active-file-none" });
    }
  }

  private async getDocumentsWithActiveFile(): Promise<IndexedDocument[]> {
    const activeFile = this.app.workspace.getActiveFile();
    const currentDocs = [...this.documents];
    
    if (activeFile && (activeFile.extension === "md" || activeFile.extension === "txt")) {
      // Check if it's already in the documents list to avoid duplication
      if (!currentDocs.some(d => d.source === "vault" && d.name === activeFile.path)) {
        try {
          const content = await this.app.vault.read(activeFile);
          currentDocs.push({
            name: activeFile.path,
            content: content,
            source: "vault"
          });
        } catch (e) {
          console.warn("Failed to read active file for auto-inclusion", e);
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
    this.modeCard(grid, "❓", "Quiz", "Test your knowledge", () => this.startQuiz());
    this.modeCard(grid, "🃏", "Flash Cards", "Review key concepts", () => this.startFlashcards());
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
    card.createEl("div", { text: emoji, cls: "ra-mode-emoji" });
    card.createEl("div", { text: title, cls: "ra-mode-title" });
    card.createEl("div", { text: desc, cls: "ra-mode-desc" });
    card.addEventListener("click", onClick);
  }

  // ════════════════════════════════════════════════════════
  // Chat page
  // ════════════════════════════════════════════════════════

  private buildChatPage(root: HTMLElement) {
    this.chatEl = root.createDiv("ra-chat");
    const char = getCharacterBySprite(this.plugin.settings.assistantPhotoFilename || "sprite-pixel.png");
    this.appendCatMsg(char.greeting);

    const bar = root.createDiv("ra-input-bar");
    this.chatInput = bar.createEl("textarea", {
      cls: "ra-input",
      attr: { placeholder: `${char.name}에게 물어보기…`, rows: "1" },
    }) as HTMLTextAreaElement;
    this.chatInput.addEventListener("input", () => {
      this.chatInput.style.height = "auto";
      this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + "px";
    });
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.submitChat(); }
    });
    this.sendBtn = bar.createEl("button", { cls: "ra-send-btn" });
    this.sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
    this.sendBtn.addEventListener("click", () => this.submitChat());
  }

  private async submitChat() {
    const q = this.chatInput.value.trim();
    if (!q) return;
    this.appendUserMsg(q);
    this.chatInput.value = "";
    this.chatInput.style.height = "auto";
    this.sendBtn.disabled = true;

    // Create a thinking/placeholder bubble
    const thinkingRow = this.appendCatMsg("...", true);
    const bubble = thinkingRow.querySelector(".ra-bubble") as HTMLElement;
    const actions = thinkingRow.querySelector(".ra-msg-actions") as HTMLElement;
    if (actions) actions.style.display = "none";

    let fullAnswer = "";
    try {
      const currentDocs = await this.getDocumentsWithActiveFile();
      
      const answer = await this.plugin.aiService.ask(q, currentDocs, (chunk) => {
        if (fullAnswer === "") {
          bubble.removeClass("ra-bubble--thinking");
          bubble.empty();
        }
        fullAnswer += chunk;
        bubble.innerHTML = this.renderMarkdown(fullAnswer);
        this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "auto" });
      });

      // Finalize
      bubble.innerHTML = this.renderMarkdown(answer);
      if (actions) {
        actions.style.display = "flex";
        // Re-bind actions with the full text
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

  private refreshMsgActions(row: HTMLElement, text: string) {
    const actions = row.querySelector(".ra-msg-actions") as HTMLElement;
    if (!actions) return;
    actions.empty();

    const copyBtn = actions.createEl("button", { cls: "ra-icon-btn", attr: { title: "Copy to clipboard" } });
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      new Notice("Copied to clipboard");
    });

    const col = row.querySelector(".ra-msg-col") as HTMLElement;
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
    if (currentDocs.length === 0) { new Notice("Add some notes or open a file first!"); return; }
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
      // Loading state
      page.createEl("div", { text: "Generating quiz…", cls: "ra-center-msg" });
      page.createEl("div", { cls: "ra-spinner" });
      this.generateQuiz(page);
      return;
    }

    if (this.quizIndex >= this.quizQuestions.length) {
      this.buildQuizResults(page);
      return;
    }

    const q = this.quizQuestions[this.quizIndex];
    const progress = `${this.quizIndex + 1} / ${this.quizQuestions.length}`;

    // Progress bar
    const progWrap = page.createDiv("ra-progress-wrap");
    progWrap.createEl("span", { text: `Question ${progress}`, cls: "ra-progress-label" });
    progWrap.createEl("span", { text: `Score: ${this.quizScore}`, cls: "ra-progress-score" });
    const bar = progWrap.createDiv("ra-progress-bar");
    bar.createDiv("ra-progress-fill").style.width = `${(this.quizIndex / this.quizQuestions.length) * 100}%`;

    // Question bubble
    const qBubble = page.createDiv("ra-quiz-question");
    qBubble.setText(q.question);

    // Answer area
    const answerWrap = page.createDiv("ra-quiz-answer-wrap");
    
    if (q.options && q.options.length > 0) {
      // MCQ Mode
      const optionsContainer = answerWrap.createDiv("ra-quiz-options");
      q.options.forEach((opt, idx) => {
        const char = String.fromCharCode(65 + idx); // A, B, C, D
        const optBtn = optionsContainer.createEl("button", { 
          cls: "ra-quiz-option-btn",
          text: `${char}) ${opt}`
        });
        if (this.quizAnswered) optBtn.disabled = true;
        optBtn.addEventListener("click", () => this.submitQuizAnswer(opt));
      });
    } else {
      // Text Input Mode
      const answerInput = answerWrap.createEl("textarea", {
        cls: "ra-quiz-answer-input",
        attr: { placeholder: "Type your answer…", rows: "3" },
      }) as HTMLTextAreaElement;

      answerInput.addEventListener("keydown", (e) => e.stopPropagation());

      const submitBtn = answerWrap.createEl("button", { text: "Submit Answer", cls: "ra-btn ra-btn-accent" });
      if (this.quizAnswered) {
        answerInput.disabled = true;
        submitBtn.disabled = true;
      }

      submitBtn.addEventListener("click", () => this.submitQuizAnswer(answerInput.value.trim()));
    }

    const feedbackEl = page.createDiv("ra-quiz-feedback");
    feedbackEl.style.display = "none";
  }

  private async submitQuizAnswer(userAns: string) {
    if (!userAns || this.quizAnswered) return;

    const q = this.quizQuestions[this.quizIndex];
    this.quizAnswered = true;
    this.render(); // Redraw to disable buttons/input

    // Get the NEW root after render
    const root = this.containerEl.children[1] as HTMLElement;
    const feedbackEl = root.querySelector(".ra-quiz-feedback") as HTMLElement;
    if (!feedbackEl) return;

    feedbackEl.style.display = "block";

    const isMCQ = q.options && q.options.length > 0;

    if (isMCQ) {
      // Direct comparison — no AI call needed
      const correct = userAns.trim().toLowerCase() === q.answer.trim().toLowerCase();
      if (correct) this.quizScore++;
      feedbackEl.addClass(correct ? "ra-quiz-feedback--correct" : "ra-quiz-feedback--wrong");
      feedbackEl.innerHTML = `<strong>${correct ? "✓ Correct!" : "✗ Not quite"}</strong><br><em>Answer: ${q.answer}</em>`;

      const page = root.querySelector(".ra-quiz-page") as HTMLElement;
      const nextBtn = page.createEl("button", {
        text: this.quizIndex + 1 < this.quizQuestions.length ? "Next →" : "See Results",
        cls: "ra-btn ra-btn-accent ra-quiz-next"
      });
      nextBtn.addEventListener("click", () => { this.quizIndex++; this.quizAnswered = false; this.render(); });
    } else {
      feedbackEl.setText("Checking…");
      try {
        const result = await this.plugin.aiService.evaluateAnswer(q.question, q.answer, userAns);
        feedbackEl.empty();
        feedbackEl.addClass(result.correct ? "ra-quiz-feedback--correct" : "ra-quiz-feedback--wrong");
        feedbackEl.innerHTML = `<strong>${result.correct ? "✓ Correct!" : "✗ Not quite"}</strong><br>${result.feedback}<br><em>Model answer: ${q.answer}</em>`;
        if (result.correct) this.quizScore++;

        const page = root.querySelector(".ra-quiz-page") as HTMLElement;
        const nextBtn = page.createEl("button", {
          text: this.quizIndex + 1 < this.quizQuestions.length ? "Next →" : "See Results",
          cls: "ra-btn ra-btn-accent ra-quiz-next"
        });
        nextBtn.addEventListener("click", () => { this.quizIndex++; this.quizAnswered = false; this.render(); });
      } catch (e) {
        this.quizAnswered = false;
        this.render();
        new Notice(this.friendlyError(e));
      }
    }
  }

  private buildQuizSetup(page: HTMLElement) {
    new Setting(page)
      .setName("Count")
      .addDropdown(drop => {
        drop.addOption("5", "5 Questions")
          .addOption("10", "10 Questions")
          .addOption("15", "15 Questions")
          .addOption("20", "20 Questions")
          .addOption("30", "30 Questions")
          .setValue(String(this.plugin.settings.quizCount || 5))
          .onChange(async (val) => {
            this.plugin.settings.quizCount = parseInt(val);
            await this.plugin.saveSettings();
          });
      });

    new Setting(page)
      .setName("Type")
      .addDropdown(drop => {
        drop.addOption("mcq", "Multiple Choice")
          .addOption("short", "Short Answer")
          .addOption("subjective", "Subjective")
          .setValue(this.plugin.settings.quizType)
          .onChange(async (val: any) => {
            this.plugin.settings.quizType = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(page)
      .setName("Difficulty")
      .addDropdown(drop => {
        drop.addOption("easy", "Easy")
          .addOption("medium", "Medium")
          .addOption("hard", "Hard")
          .setValue(this.plugin.settings.quizDifficulty)
          .onChange(async (val) => {
            this.plugin.settings.quizDifficulty = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(page)
      .setName("Language")
      .addDropdown(drop => {
        drop.addOption("both", "English & Korean")
          .addOption("english", "English Only")
          .addOption("korean", "Korean Only")
          .setValue(this.plugin.settings.quizLanguage)
          .onChange(async (val: any) => {
            this.plugin.settings.quizLanguage = val;
            await this.plugin.saveSettings();
          });
      });

    const btnRow = page.createDiv("ra-setup-btns");
    const startBtn = btnRow.createEl("button", { text: "Start Quiz", cls: "ra-btn ra-btn-accent" });
    startBtn.addEventListener("click", () => {
      this.quizStarted = true;
      this.render();
    });

    const backBtn = btnRow.createEl("button", { text: "Back", cls: "ra-btn" });
    backBtn.addEventListener("click", () => this.setMode("home"));
  }

  private buildQuizResults(page: HTMLElement) {
    const pct = Math.round((this.quizScore / this.quizQuestions.length) * 100);
    page.createEl("div", { text: "Quiz Complete!", cls: "ra-result-title" });
    page.createEl("div", { text: `${this.quizScore} / ${this.quizQuestions.length}`, cls: "ra-result-score" });
    page.createEl("div", { text: `${pct}%`, cls: "ra-result-pct" });
    const msg = pct >= 80 ? "Excellent work! 🎉" : pct >= 60 ? "Good effort! Keep reviewing." : "Keep studying — you'll get there!";
    page.createEl("div", { text: msg, cls: "ra-result-msg" });
    const btnRow = page.createDiv("ra-result-btns");
    const saveBtn = btnRow.createEl("button", { text: "Save Results", cls: "ra-btn ra-btn-accent" });
    saveBtn.addEventListener("click", () => this.saveQuizResults());

    const retryBtn = btnRow.createEl("button", { text: "Retry", cls: "ra-btn" });
    retryBtn.addEventListener("click", () => { this.quizQuestions = []; this.quizIndex = 0; this.quizScore = 0; this.render(); });
    
    const homeBtn = btnRow.createEl("button", { text: "Home", cls: "ra-btn" });
    homeBtn.addEventListener("click", () => this.setMode("home"));
  }

  private async saveQuizResults() {
    if (this.quizQuestions.length === 0) return;
    
    let content = `# Quiz Results: ${new Date().toLocaleString()}\n\n`;
    content += `**Score:** ${this.quizScore} / ${this.quizQuestions.length} (${Math.round((this.quizScore / this.quizQuestions.length) * 100)}%)\n\n---\n\n`;
    
    this.quizQuestions.forEach((q, i) => {
      content += `### Q${i + 1}: ${q.question}\n`;
      content += `**Model Answer:** ${q.answer}\n\n`;
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
      page.empty();
      page.createEl("div", { text: this.friendlyError(e), cls: "ra-center-msg ra-error" });
      const back = page.createEl("button", { text: "← Back", cls: "ra-btn" });
      back.addEventListener("click", () => this.setMode("home"));
    }
  }

  // ════════════════════════════════════════════════════════
  // Flashcards page
  // ════════════════════════════════════════════════════════

  private async startFlashcards() {
    const currentDocs = await this.getDocumentsWithActiveFile();
    if (currentDocs.length === 0) { new Notice("Add some notes or open a file first!"); return; }
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
      page.createEl("div", { text: "Generating flashcards…", cls: "ra-center-msg" });
      page.createEl("div", { cls: "ra-spinner" });
      this.generateFlashcards(page);
      return;
    }

    if (this.cardIndex >= this.flashcards.length) {
      this.buildFlashcardsResults(page);
      return;
    }

    const card = this.flashcards[this.cardIndex];
    const known = this.cardKnown.filter(Boolean).length;

    // Progress
    const progWrap = page.createDiv("ra-progress-wrap");
    progWrap.createEl("span", { text: `${this.cardIndex + 1} / ${this.flashcards.length}`, cls: "ra-progress-label" });
    progWrap.createEl("span", { text: `✓ ${known}`, cls: "ra-progress-score" });
    const bar = progWrap.createDiv("ra-progress-bar");
    bar.createDiv("ra-progress-fill").style.width = `${(this.cardIndex / this.flashcards.length) * 100}%`;

    // Card
    const cardEl = page.createDiv("ra-flashcard" + (this.cardFlipped ? " ra-flashcard--flipped" : ""));
    const front = cardEl.createDiv("ra-flashcard-front");
    front.createEl("div", { text: "TERM", cls: "ra-flashcard-side-label" });
    front.createEl("div", { text: card.front, cls: "ra-flashcard-text" });

    const back = cardEl.createDiv("ra-flashcard-back");
    back.createEl("div", { text: "DEFINITION", cls: "ra-flashcard-side-label" });
    back.createEl("div", { text: card.back, cls: "ra-flashcard-text" });

    if (!this.cardFlipped) {
      cardEl.addEventListener("click", () => { this.cardFlipped = true; this.render(); });
    } else {
      const btnRow = page.createDiv("ra-flash-btn-row");
      const dontKnow = btnRow.createEl("button", { text: "✗ Still learning", cls: "ra-btn ra-btn-wrong" });
      const doKnow = btnRow.createEl("button", { text: "✓ Got it!", cls: "ra-btn ra-btn-correct" });
      dontKnow.addEventListener("click", () => { this.cardKnown.push(false); this.cardIndex++; this.cardFlipped = false; this.render(); });
      doKnow.addEventListener("click", () => { this.cardKnown.push(true); this.cardIndex++; this.cardFlipped = false; this.render(); });
    }
  }

  private buildFlashcardsSetup(page: HTMLElement) {
    new Setting(page)
      .setName("Count")
      .addDropdown(drop => {
        drop.addOption("5", "5 Cards")
          .addOption("10", "10 Cards")
          .addOption("15", "15 Cards")
          .addOption("20", "20 Cards")
          .addOption("30", "30 Cards")
          .addOption("50", "50 Cards")
          .setValue(String(this.plugin.settings.flashcardCount || 10))
          .onChange(async (val) => {
            this.plugin.settings.flashcardCount = parseInt(val);
            await this.plugin.saveSettings();
          });
      });

    new Setting(page)
      .setName("Difficulty")
      .addDropdown(drop => {
        drop.addOption("easy", "Easy")
          .addOption("medium", "Medium")
          .addOption("hard", "Hard")
          .setValue(this.plugin.settings.flashcardDifficulty)
          .onChange(async (val) => {
            this.plugin.settings.flashcardDifficulty = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(page)
      .setName("Language")
      .addDropdown(drop => {
        drop.addOption("both", "English & Korean")
          .addOption("english", "English Only")
          .addOption("korean", "Korean Only")
          .setValue(this.plugin.settings.flashcardLanguage)
          .onChange(async (val: any) => {
            this.plugin.settings.flashcardLanguage = val;
            await this.plugin.saveSettings();
          });
      });

    const btnRow = page.createDiv("ra-setup-btns");
    const startBtn = btnRow.createEl("button", { text: "Start Review", cls: "ra-btn ra-btn-accent" });
    startBtn.addEventListener("click", () => {
      this.flashcardsStarted = true;
      this.render();
    });

    const backBtn = btnRow.createEl("button", { text: "Back", cls: "ra-btn" });
    backBtn.addEventListener("click", () => this.setMode("home"));
  }

  private buildFlashcardsResults(page: HTMLElement) {
    const known = this.cardKnown.filter(Boolean).length;
    const pct = Math.round((known / this.flashcards.length) * 100);
    page.createEl("div", { text: "Session Complete!", cls: "ra-result-title" });
    page.createEl("div", { text: `${known} / ${this.flashcards.length} known`, cls: "ra-result-score" });
    page.createEl("div", { text: `${pct}%`, cls: "ra-result-pct" });
    const msg = pct >= 80 ? "You're mastering this! 🎉" : pct >= 60 ? "Good progress — keep it up!" : "Review more and try again!";
    page.createEl("div", { text: msg, cls: "ra-result-msg" });
    const btnRow = page.createDiv("ra-result-btns");
    const retryBtn = btnRow.createEl("button", { text: "New Cards", cls: "ra-btn ra-btn-accent" });
    retryBtn.addEventListener("click", () => { this.flashcards = []; this.cardIndex = 0; this.cardFlipped = false; this.cardKnown = []; this.render(); });
    const homeBtn = btnRow.createEl("button", { text: "Home", cls: "ra-btn" });
    homeBtn.addEventListener("click", () => this.setMode("home"));
  }

  private buildNotebookLMPage(root: HTMLElement) {
    const page = root.createDiv("ra-page ra-notebooklm-page");
    page.style.height = "100%";
    page.style.display = "flex";
    page.style.flexDirection = "column";
    page.style.padding = "0";

    if (Platform.isDesktop) {
      // Desktop: embed via iframe (works in Electron/Obsidian desktop)
      const iframe = document.createElement("iframe");
      iframe.setAttribute("src", "https://notebooklm.google.com/");
      iframe.setAttribute("allow", "clipboard-read; clipboard-write");
      iframe.style.flex = "1";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      page.appendChild(iframe);
    } else {
      // Mobile/iPad: can't embed external sites, provide open-in-browser button
      const wrap = page.createDiv("ra-notebooklm-mobile");
      wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:12px;padding:24px;text-align:center;";
      wrap.createEl("div", { text: "📓", attr: { style: "font-size:48px;" } });
      wrap.createEl("div", { text: "NotebookLM", attr: { style: "font-size:20px;font-weight:600;" } });
      wrap.createEl("div", { text: "NotebookLM cannot be embedded on mobile. Tap below to open it in your browser.", cls: "ra-home-label" });
      const openBtn = wrap.createEl("button", { text: "Open NotebookLM", cls: "ra-btn ra-btn-accent" });
      openBtn.addEventListener("click", () => {
        window.open("https://notebooklm.google.com/", "_blank");
      });
    }
  }

  private async generateFlashcards(page: HTMLElement) {
    try {
      const currentDocs = await this.getDocumentsWithActiveFile();
      this.flashcards = await this.plugin.aiService.generateFlashcards(currentDocs);
      this.cardIndex = 0; this.cardFlipped = false; this.cardKnown = [];
      this.render();
    } catch (e) {
      page.empty();
      page.createEl("div", { text: this.friendlyError(e), cls: "ra-center-msg ra-error" });
      const back = page.createEl("button", { text: "← Back", cls: "ra-btn" });
      back.addEventListener("click", () => this.setMode("home"));
    }
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

  private appendCatMsg(text: string, isThinking = false): HTMLElement {
    const row = this.chatEl.createDiv("ra-row ra-row--cat");
    if (this.catSrc) {
      const img = row.createEl("img", { cls: "ra-avatar" });
      img.src = this.catSrc;
    }
    const col = row.createDiv("ra-msg-col");
    const bubble = col.createDiv("ra-bubble ra-bubble--cat");
    if (isThinking) {
      bubble.addClass("ra-bubble--thinking");
      bubble.innerHTML = `<span class="ra-dot"></span><span class="ra-dot"></span><span class="ra-dot"></span>`;
      col.createDiv("ra-msg-actions"); // placeholder; populated by refreshMsgActions after streaming
    } else {
      bubble.innerHTML = this.renderMarkdown(text);
      const actions = col.createDiv("ra-msg-actions");
      
      const copyBtn = actions.createEl("button", { cls: "ra-icon-btn", attr: { title: "Copy to clipboard" } });
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(text);
        new Notice("Copied to clipboard");
      });

      const saveBtn = actions.createEl("button", { text: "Save as note", cls: "ra-action-btn" });
      saveBtn.addEventListener("click", () => this.saveAsNote(text, col));
      const appendBtn = actions.createEl("button", { text: "Append to note", cls: "ra-action-btn" });
      appendBtn.addEventListener("click", () => this.showAppendPicker(text, col));
    }
    this.chatEl.scrollTo({ top: this.chatEl.scrollHeight, behavior: "smooth" });
    return row;
  }

  private renderMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>")
      .replace(/^[-•] (.+)$/gm, "• $1")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  private friendlyError(e: unknown): string {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("API_KEY") || msg.includes("key")) return `No valid API key — check Settings → Multi-AI Assistant.`;
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) return "Quota hit — try again in a minute or switch models in Settings.";
    if (msg.includes("No documents")) return "Add some notes or files first using the panel above!";
    return `Error: ${msg}`;
  }

  // ════════════════════════════════════════════════════════
  // Save / Append
  // ════════════════════════════════════════════════════════

  private saveAsNote(content: string, container: HTMLElement) {
    container.querySelector(".ra-save-form")?.remove();
    const form = container.createDiv("ra-save-form");
    const input = form.createEl("input", { cls: "ra-save-input", attr: { placeholder: "e.g. Research/summary.md", type: "text" } }) as HTMLInputElement;
    const btnRow = form.createDiv("ra-save-btn-row");
    const ok = btnRow.createEl("button", { text: "Create", cls: "ra-action-btn ra-action-btn--accent" });
    const cancel = btnRow.createEl("button", { text: "Cancel", cls: "ra-action-btn" });
    input.focus();
    const doSave = async () => {
      let path = input.value.trim(); if (!path) return;
      if (!path.endsWith(".md")) path += ".md";
      try {
        if (this.plugin.app.vault.getAbstractFileByPath(path)) { new Notice(`Already exists: ${path}`); return; }
        await this.plugin.app.vault.create(path, content);
        new Notice(`Created: ${path}`); form.remove();
      } catch (e) { new Notice("Failed: " + (e as Error).message); }
    };
    ok.addEventListener("click", doSave);
    cancel.addEventListener("click", () => form.remove());
    input.addEventListener("keydown", (e) => { 
      e.stopPropagation();
      if (e.key === "Enter") doSave(); 
      if (e.key === "Escape") form.remove(); 
    });
  }

  private showAppendPicker(content: string, container: HTMLElement) {
    container.querySelector(".ra-save-form")?.remove();
    const form = container.createDiv("ra-save-form");
    const sw = form.createDiv("ra-search-wrap");
    const inp = sw.createEl("input", { cls: "ra-save-input", attr: { placeholder: "Search note to append to…", type: "text" } }) as HTMLInputElement;
    const dd = sw.createDiv("ra-dropdown"); dd.style.display = "none";
    const cancel = form.createEl("button", { text: "Cancel", cls: "ra-action-btn" });
    cancel.addEventListener("click", () => form.remove());
    const search = () => {
      const q = inp.value.trim().toLowerCase();
      const files = this.plugin.app.vault.getMarkdownFiles().filter(f => !q || f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q)).slice(0, 8);
      dd.empty();
      if (!files.length) { dd.style.display = "none"; return; }
      files.forEach(file => {
        const item = dd.createDiv("ra-dropdown-item");
        item.createDiv("ra-dropdown-item-top").createEl("span", { text: "📄 " + file.basename, cls: "ra-dropdown-name" });
        item.createEl("span", { text: file.path, cls: "ra-dropdown-path" });
        item.addEventListener("mousedown", async (e) => {
          e.preventDefault();
          try {
            await this.plugin.app.vault.modify(file, await this.plugin.app.vault.read(file) + "\n\n---\n\n" + content);
            new Notice(`Appended to: ${file.path}`); form.remove();
          } catch (err) { new Notice("Failed: " + (err as Error).message); }
        });
      });
      dd.style.display = "block";
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
    return this.plugin.app.vault.getFiles().filter(f => ["md", "pdf", "txt", "png", "jpg", "jpeg", "webp", "gif"].includes(f.extension.toLowerCase()));
  }

  private onSearchInput() {
    const query = this.searchInput.value.trim().toLowerCase();
    const allFiles = this.getVaultReadableFiles();

    const folderPaths = new Map<string, TFolder>();
    allFiles.forEach(f => {
      let folder = f.parent;
      while (folder && folder.path !== "/") {
        if (!folderPaths.has(folder.path)) folderPaths.set(folder.path, folder);
        folder = folder.parent;
      }
    });

    const addedNotePaths = new Set(this.documents.filter(d => d.source === "vault" && !d.name.endsWith("/")).map(d => d.name));
    const addedFolderPaths = new Set(this.documents.filter(d => d.source === "vault" && d.name.endsWith("/")).map(d => d.name));
    const results: DropdownResult[] = [];

    if (!query) {
      folderPaths.forEach(folder => {
        if ((!folder.parent || folder.parent.path === "/") && !addedFolderPaths.has(folder.path + "/")) {
          results.push({ type: "folder", folder, count: allFiles.filter(f => f.path.startsWith(folder.path + "/")).length });
        }
      });
      allFiles.filter(f => !addedNotePaths.has(f.path)).slice(0, 6).forEach(f => results.push({ type: "note", file: f }));
    } else {
      folderPaths.forEach(folder => {
        if (folder.path.toLowerCase().includes(query) && !addedFolderPaths.has(folder.path + "/"))
          results.push({ type: "folder", folder, count: allFiles.filter(f => f.path.startsWith(folder.path + "/")).length });
      });
      allFiles.filter(f => (f.path.toLowerCase().includes(query) || f.basename.toLowerCase().includes(query)) && !addedNotePaths.has(f.path))
        .forEach(f => results.push({ type: "note", file: f }));
    }

    this.currentResults = results.slice(0, 12);
    this.renderDropdown(this.currentResults);
  }

  private renderDropdown(results: DropdownResult[]) {
    this.dropdownEl.empty(); this.focusedIndex = -1;
    if (!results.length) { this.hideDropdown(); return; }
    results.forEach((result, i) => {
      const item = this.dropdownEl.createDiv("ra-dropdown-item");
      if (result.type === "folder") {
        item.addClass("ra-dropdown-item--folder");
        const top = item.createDiv("ra-dropdown-item-top");
        top.createEl("span", { text: "📁", cls: "ra-dropdown-icon" });
        top.createEl("span", { text: result.folder.name, cls: "ra-dropdown-name" });
        top.createEl("span", { text: `${result.count} files`, cls: "ra-dropdown-badge" });
        item.createEl("span", { text: result.folder.path, cls: "ra-dropdown-path" });
      } else {
        const ext = result.file.extension.toLowerCase();
        const isPDF = ext === "pdf";
        const isImg = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
        
        const top = item.createDiv("ra-dropdown-item-top");
        let icon = "📄";
        if (isPDF) icon = "📕";
        else if (isImg) icon = "🖼️";
        
        top.createEl("span", { text: icon, cls: "ra-dropdown-icon" });
        top.createEl("span", { text: result.file.basename, cls: "ra-dropdown-name" });
        if (isPDF) top.createEl("span", { text: "PDF", cls: "ra-dropdown-badge" });
        if (isImg) top.createEl("span", { text: "IMG", cls: "ra-dropdown-badge" });
        item.createEl("span", { text: result.file.path, cls: "ra-dropdown-path" });
      }
      item.addEventListener("mouseenter", () => this.setFocusedIndex(i));
      item.addEventListener("mousedown", (e) => { e.preventDefault(); this.selectResult(result); });
    });
    this.showDropdown();
  }

  private onSearchKeydown(e: KeyboardEvent) {
    const items = Array.from(this.dropdownEl.querySelectorAll(".ra-dropdown-item")) as HTMLElement[];
    if (!this.dropdownVisible || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); this.setFocusedIndex(Math.min(this.focusedIndex + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.setFocusedIndex(Math.max(this.focusedIndex - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (this.currentResults[this.focusedIndex]) this.selectResult(this.currentResults[this.focusedIndex]); }
    else if (e.key === "Escape") this.hideDropdown();
  }

  private setFocusedIndex(i: number) {
    (Array.from(this.dropdownEl.querySelectorAll(".ra-dropdown-item")) as HTMLElement[]).forEach(el => el.removeClass("ra-dropdown-item--focused"));
    this.focusedIndex = i;
    (this.dropdownEl.querySelectorAll(".ra-dropdown-item")[i] as HTMLElement)?.addClass("ra-dropdown-item--focused");
  }

  private showDropdown() { this.dropdownEl.style.display = "block"; this.dropdownVisible = true; }
  private hideDropdown() { this.dropdownEl.style.display = "none"; this.dropdownVisible = false; this.focusedIndex = -1; }

  private async selectResult(result: DropdownResult) {
    this.hideDropdown(); this.searchInput.value = "";
    if (result.type === "note") await this.addVaultNote(result.file);
    else await this.addFolder(result.folder);
  }

  private async addVaultNote(file: TFile) {
    if (this.documents.some(d => d.source === "vault" && d.name === file.path)) { new Notice(`Already added: ${file.basename}`); return; }
    try {
      const ext = file.extension.toLowerCase();
      const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif"];
      let doc: IndexedDocument;
      
      if (ext === "pdf") {
        doc = await this.processor.readVaultPDF(file);
      } else if (imageExtensions.includes(ext)) {
        doc = await this.processor.readVaultImage(file);
      } else {
        doc = { name: file.path, content: await this.plugin.app.vault.read(file), source: "vault" as const };
      }
      
      this.documents.push(doc); this.refreshSources();
    } catch (e) { new Notice(`Could not read ${file.basename}: ${(e as Error).message}`); }
  }

  private async addFolder(folder: TFolder) {
    const key = folder.path + "/";
    if (this.documents.some(d => d.source === "vault" && d.name === key)) { new Notice(`Already added: ${folder.name}`); return; }
    const files = this.getVaultReadableFiles().filter(f => f.path.startsWith(folder.path + "/"));
    if (!files.length) { new Notice(`No readable files in ${folder.name}`); return; }
    const parts: string[] = [];
    for (const file of files) {
      try {
        const text = file.extension.toLowerCase() === "pdf"
          ? (await this.processor.readVaultPDF(file)).content
          : await this.plugin.app.vault.read(file);
        parts.push(`### ${file.basename}\n${text}`);
      } catch {}
    }
    this.documents.push({ name: key, content: parts.join("\n\n---\n\n"), source: "vault" });
    new Notice(`Added folder: ${folder.name} (${files.length} files)`);
    this.refreshSources();
  }

  private async handleUpload(files: File[]) {
    for (const file of files) {
      try {
        const doc = await this.processor.processUploadedFile(file);
        this.documents = this.documents.filter(d => !(d.source === "upload" && d.name === doc.name));
        this.documents.push(doc); new Notice(`Uploaded: ${file.name}`);
      } catch (e) { new Notice(`Error: ${(e as Error).message}`); }
    }
    this.refreshSources();
  }

  private refreshSources() {
    if (!this.sourceChipsEl) return;
    this.sourceChipsEl.empty();
    const tokens = this.plugin.aiService.estimateTokenCount(this.documents);
    if (this.tokenCountEl) this.tokenCountEl.setText(tokens > 0 ? `~${tokens.toLocaleString()} tokens · ${this.documents.length} sources` : "");
    this.documents.forEach(doc => {
      const chip = this.sourceChipsEl.createDiv("ra-chip");
      let icon = "◈";
      if (doc.source === "upload") {
        icon = "↑";
      } else if (doc.name.endsWith("/")) {
        icon = "📁";
      }
      
      if (doc.imageData) {
        icon = "🖼️";
      }
      
      const label = doc.name.endsWith("/") ? doc.name.slice(0, -1).split("/").pop()! : doc.name.split("/").pop()!;
      chip.createEl("span", { text: `${icon} ${label}`, cls: "ra-chip-label", attr: { title: doc.name } });
      const x = chip.createEl("button", { text: "×", cls: "ra-chip-remove" });
      x.addEventListener("click", () => { this.documents = this.documents.filter(d => d !== doc); this.refreshSources(); });
    });
  }
}
