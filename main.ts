import { Plugin, Platform, setIcon } from "obsidian";
import { SidebarView, VIEW_TYPE } from "./src/SidebarView";
import { AIService } from "./src/AIService";
import { setPdfWorkerSrc } from "./src/FileProcessor";
import {
  MultiAIAssistantSettingsTab,
  MultiAIAssistantSettings,
  DEFAULT_SETTINGS,
} from "./src/SettingsTab";

/** Shape of settings written by pre-1.0 builds, kept only for the migration below. */
interface LegacySettings {
  apiKey?: string;
}

export default class MultiAIAssistantPlugin extends Plugin {
  settings: MultiAIAssistantSettings;
  aiService: AIService;
  private floatingBtn: HTMLButtonElement | null = null;
  private floatingBtnText = "";

  async onload() {
    await this.loadSettings();
    this.aiService = new AIService(this.settings, this.app);

    // Point PDF.js at the worker shipped inside the plugin folder. Doing this on both
    // platforms keeps it from ever reaching its <script>-injecting fallback loader.
    setPdfWorkerSrc(
      this.app.vault.adapter.getResourcePath(`${this.manifest.dir ?? ""}/pdf.worker.min.js`)
    );

    this.registerView(VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon("bot", "Multi-AI Assistant", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      callback: () => void this.activateView(),
    });

    this.addSettingTab(new MultiAIAssistantSettingsTab(this.app, this));

    // Floating "ask about selection" button (desktop: mouseup; mobile: touchend)
    if (Platform.isDesktop) {
      this.registerDomEvent(document, "mouseup", (evt: MouseEvent) => {
        this.handleSelection(evt);
      });
      this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
        if (this.floatingBtn && evt.target !== this.floatingBtn && !this.floatingBtn.contains(evt.target as Node)) {
          this.hideFloatingBtn();
        }
      });
      this.registerDomEvent(document, "selectionchange", () => {
        const selection = document.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
          this.hideFloatingBtn();
        }
      });
    } else {
      this.registerDomEvent(document, "touchend", (evt: TouchEvent) => {
        const touch = evt.changedTouches[0];
        if (touch) this.handleSelectionTouch(touch.pageX, touch.pageY);
      });
      this.registerDomEvent(document, "touchstart", (evt: TouchEvent) => {
        if (this.floatingBtn && evt.target !== this.floatingBtn && !this.floatingBtn.contains(evt.target as Node)) {
          this.hideFloatingBtn();
        }
      });
    }
  }

  private handleSelection(evt: MouseEvent) {
    if (!this.settings.showSelectionButton) return;
    // Use the document the click happened in so the button also works in popout windows.
    const doc = (evt.target as HTMLElement | null)?.ownerDocument ?? document;
    const selectedText = doc.getSelection()?.toString().trim();
    if (!selectedText) return;

    if (!this.floatingBtn || this.floatingBtn.ownerDocument !== doc) {
      this.floatingBtn?.remove();
      this.createFloatingBtn(doc);
    }
    this.showFloatingBtn(evt.pageX, evt.pageY, selectedText);
  }

  private handleSelectionTouch(pageX: number, pageY: number) {
    if (!this.settings.showSelectionButton) return;
    const selectedText = document.getSelection()?.toString().trim();
    if (!selectedText) return;

    if (!this.floatingBtn) this.createFloatingBtn(document);
    this.showFloatingBtn(pageX, pageY, selectedText);
  }

  private createFloatingBtn(doc: Document) {
    const btn = doc.body.createEl("button", {
      cls: "ra-floating-search-btn",
      attr: { "aria-label": "Ask the assistant about the selection" },
    });
    setIcon(btn.createSpan("ra-floating-search-icon"), "sparkles");
    btn.createSpan({ text: "Ask", cls: "ra-floating-search-label" });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.floatingBtnText;
      this.hideFloatingBtn();
      void this.askAboutSelection(text);
    });
    this.floatingBtn = btn;
  }

  private async askAboutSelection(text: string) {
    if (!text) return;
    await this.activateView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const view = leaves[0]?.view;
    if (view instanceof SidebarView) {
      await view.searchExternal(text);
    }
  }

  private showFloatingBtn(x: number, y: number, text: string) {
    if (!this.floatingBtn) return;
    this.floatingBtnText = text;
    // Position just below-right of the cursor.
    this.floatingBtn.setCssProps({
      "--ra-float-left": `${x + 8}px`,
      "--ra-float-top": `${y + 12}px`,
    });
    this.floatingBtn.addClass("is-visible");
  }

  private hideFloatingBtn() {
    this.floatingBtn?.removeClass("is-visible");
  }

  onunload() {
    // Note: the sidebar leaf is intentionally NOT detached here — Obsidian restores
    // it on reload, and detaching would reset any position the user chose for it.
    this.floatingBtn?.remove();
    this.floatingBtn = null;
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    const loadedData = (await this.loadData()) as (Partial<MultiAIAssistantSettings> & LegacySettings) | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    this.settings.apiKeys = Object.assign({}, DEFAULT_SETTINGS.apiKeys, loadedData?.apiKeys);

    // Migration: a single `apiKey` used to be stored for whichever provider was active.
    if (loadedData?.apiKey && this.settings.provider) {
      if (!this.settings.apiKeys[this.settings.provider]) {
        this.settings.apiKeys[this.settings.provider] = loadedData.apiKey;
      }
      delete (this.settings as Partial<LegacySettings>).apiKey;
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (!this.settings.showSelectionButton) this.hideFloatingBtn();
    this.aiService.updateSettings(this.settings);
  }
}
