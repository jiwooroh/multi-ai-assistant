import { Plugin, setIcon } from "obsidian";
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

    this.registerView(VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon("bot", "Multi-AI Assistant", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-sidebar",
      name: "Open assistant sidebar",
      callback: () => {
        void this.activateView();
      },
    });

    this.addSettingTab(new MultiAIAssistantSettingsTab(this.app, this));

    // Floating Button Logic for Text Selection
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
  }

  private handleSelection(evt: MouseEvent) {
    const doc = activeDocument || document;
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

  private createFloatingBtn(doc: Document) {
    this.floatingBtn = doc.createEl('button');
    this.floatingBtn.className = 'ra-floating-search-btn';
    setIcon(this.floatingBtn, 'search');
    doc.body.appendChild(this.floatingBtn);
  }

  private showFloatingBtn(x: number, y: number, text: string) {
    if (!this.floatingBtn) return;
    this.floatingBtn.setCssStyles({
      display: 'flex',
      left: `${x + 15}px`,
      top: `${y + 15}px`
    });
    
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
      this.floatingBtn.setCssStyles({
        display: 'none'
      });
    }
  }

  onunload() {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    
    // Migration: If legacy apiKey exists and apiKeys for that provider is empty, migrate it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((loadedData as any)?.apiKey && this.settings.provider) {
      if (!this.settings.apiKeys[this.settings.provider]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        this.settings.apiKeys[this.settings.provider] = (loadedData as any).apiKey;
      }
      // Optional: remove legacy apiKey from settings object after migration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (this.settings as any).apiKey;
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.aiService.updateSettings(this.settings);
  }
}
