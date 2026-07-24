import { Plugin, WorkspaceLeaf, Notice, Platform } from "obsidian";
import { SidebarView, VIEW_TYPE } from "./src/SidebarView";
import { AIService } from "./src/AIService";
import {
  MultiAIAssistantSettingsTab,
  MultiAIAssistantSettings,
  DEFAULT_SETTINGS,
} from "./src/SettingsTab";

export default class MultiAIAssistantPlugin extends Plugin {
  settings: MultiAIAssistantSettings;
  aiService: AIService;
  private floatingBtn: HTMLButtonElement | null = null;

  async onload() {
    await this.loadSettings();
    this.aiService = new AIService(this.settings, this.app);

    // Resolve the PDF.js worker file URL (desktop only — mobile runs PDF.js on main thread)
    const pluginDir = this.manifest.dir;
    const adapter = this.app.vault.adapter as any;
    if (typeof adapter.getResourcePath === "function") {
      (window as any).__ra_pdfWorkerSrc = adapter.getResourcePath(
        `${pluginDir}/pdf.worker.min.js`
      );
    }

    this.registerView(VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon("bot", "Multi-AI Assistant", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-multi-ai-assistant",
      name: "Open Multi-AI Assistant sidebar",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new MultiAIAssistantSettingsTab(this.app, this));

    // Floating Button Logic for Text Selection (desktop: mouseup; mobile: touchend)
    if (Platform.isDesktop) {
      this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
        this.handleSelection(evt);
      });
      this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
        if (this.floatingBtn && evt.target !== this.floatingBtn && !this.floatingBtn.contains(evt.target as Node)) {
          this.hideFloatingBtn();
        }
      });
      this.registerDomEvent(document, 'selectionchange', () => {
        const selection = document.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
          this.hideFloatingBtn();
        }
      });
    } else {
      this.registerDomEvent(document, 'touchend', (evt: TouchEvent) => {
        const touch = evt.changedTouches[0];
        if (touch) this.handleSelectionTouch(touch.pageX, touch.pageY);
      });
      this.registerDomEvent(document, 'touchstart', (evt: TouchEvent) => {
        if (this.floatingBtn && evt.target !== this.floatingBtn && !this.floatingBtn.contains(evt.target as Node)) {
          this.hideFloatingBtn();
        }
      });
    }
  }

  private handleSelection(evt: MouseEvent) {
    const doc = this.app.workspace.activeLeaf?.view.containerEl.ownerDocument || document;
    const selection = doc.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      if (!this.floatingBtn) {
        this.createFloatingBtn(doc);
      } else if (this.floatingBtn.ownerDocument !== doc) {
        this.floatingBtn.remove();
        this.createFloatingBtn(doc);
      }
      this.showFloatingBtn(evt.pageX, evt.pageY, selectedText);
    }
  }

  private handleSelectionTouch(pageX: number, pageY: number) {
    const doc = document;
    const selection = doc.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      if (!this.floatingBtn) this.createFloatingBtn(doc);
      this.showFloatingBtn(pageX, pageY, selectedText);
    }
  }

  private createFloatingBtn(doc: Document) {
    this.floatingBtn = doc.createElement('button');
    this.floatingBtn.className = 'ra-floating-search-btn';
    this.floatingBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    doc.body.appendChild(this.floatingBtn);
  }

  private showFloatingBtn(x: number, y: number, text: string) {
    if (!this.floatingBtn) return;
    this.floatingBtn.style.display = 'flex';
    // Position at bottom-right of the cursor
    this.floatingBtn.style.left = `${x + 15}px`;
    this.floatingBtn.style.top = `${y + 15}px`;
    
    this.floatingBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideFloatingBtn();
      
      await this.activateView();
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
      if (leaves.length > 0) {
        const view = leaves[0].view as SidebarView;
        await view.searchExternal(text);
      }
    };
  }

  private hideFloatingBtn() {
    if (this.floatingBtn) {
      this.floatingBtn.style.display = 'none';
    }
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    if (this.floatingBtn) {
      this.floatingBtn.remove();
    }
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
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    
    // Migration: If legacy apiKey exists and apiKeys for that provider is empty, migrate it
    if ((loadedData as any)?.apiKey && this.settings.provider) {
      if (!this.settings.apiKeys[this.settings.provider]) {
        this.settings.apiKeys[this.settings.provider] = (loadedData as any).apiKey;
      }
      // Optional: remove legacy apiKey from settings object after migration
      delete (this.settings as any).apiKey;
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.aiService.updateSettings(this.settings);
  }
}
