import { App, TFile, Notice } from "obsidian";
import type { IndexedDocument } from "./AIService";

export class FileProcessor {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async indexVaultNotes(maxNotes: number): Promise<IndexedDocument[]> {
    const mdFiles = this.app.vault.getMarkdownFiles();
    const toIndex = mdFiles.slice(0, maxNotes);
    const documents: IndexedDocument[] = [];

    for (const file of toIndex) {
      try {
        const content = await this.app.vault.read(file);
        if (content.trim().length > 0) {
          documents.push({
            name: file.path,
            content: this.truncate(content, 8000),
            source: "vault",
          });
        }
      } catch (e) {
        console.warn(`Research Assistant: could not read ${file.path}`, e);
      }
    }

    return documents;
  }

  async processUploadedFile(file: File): Promise<IndexedDocument> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif"];
    
    if (ext === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const text = await this.parsePDFArrayBuffer(arrayBuffer);
      return { name: file.name, content: this.truncate(text, 50000), source: "upload" };
    } else if (ext === "md" || ext === "txt") {
      const text = await file.text();
      return { name: file.name, content: this.truncate(text, 50000), source: "upload" };
    } else if (ext && imageExtensions.includes(ext)) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      return { 
        name: file.name, 
        content: `[Image File: ${file.name}]`, 
        source: "upload",
        imageData: base64,
        mimeType: mimeType
      };
    } else {
      throw new Error(`Unsupported file type: .${ext}. Supported: .md, .txt, .pdf, .png, .jpg, .jpeg, .webp, .gif`);
    }
  }

  async readVaultPDF(file: TFile): Promise<IndexedDocument> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const text = await this.parsePDFArrayBuffer(arrayBuffer);
    return { name: file.path, content: this.truncate(text, 50000), source: "vault" };
  }

  async readVaultImage(file: TFile): Promise<IndexedDocument> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const base64 = this.arrayBufferToBase64(arrayBuffer);
    const ext = file.extension.toLowerCase();
    const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
    return { 
      name: file.path, 
      content: `[Vault Image: ${file.path}]`, 
      source: "vault",
      imageData: base64,
      mimeType: mimeType
    };
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private async parsePDFArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
    // pdfjs-dist v3 legacy CJS build
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    const pdfjsLib = pdfjs.default ?? pdfjs;

    // On desktop the worker URL is pre-resolved; on mobile fall back to empty string
    // which makes pdfjs run in fake-worker (main-thread) mode.
    const workerSrc = (window as any).__ra_pdfWorkerSrc ?? "";
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = (content.items as any[])
        .map((item) => item.str ?? "")
        .join(" ");
      pageTexts.push(pageText);
    }

    return pageTexts.join("\n\n");
  }

  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n\n[... truncated for context limit ...]";
  }
}
