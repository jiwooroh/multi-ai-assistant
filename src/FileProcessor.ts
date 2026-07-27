import { App, TFile } from "obsidian";
import type { IndexedDocument } from "./AIService";

/** URL of the PDF.js worker shipped in the plugin folder. Resolved once at plugin load. */
let pdfWorkerSrc = "";

export function setPdfWorkerSrc(src: string) {
  pdfWorkerSrc = src;
}

/**
 * Minimal structural types for the parts of pdfjs-dist we actually touch.
 * The library ships its own types, but they pull in DOM/canvas declarations we
 * do not need, so the surface is narrowed here instead.
 */
interface PdfTextItem {
  str?: string;
}
interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
}
interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: {
    data: Uint8Array;
    useWorkerFetch?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }): { promise: Promise<PdfDocument> };
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

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
        const content = await this.app.vault.cachedRead(file);
        if (content.trim().length > 0) {
          documents.push({
            name: file.path,
            content: this.truncate(content, 8000),
            source: "vault",
          });
        }
      } catch (e) {
        console.warn(`Multi-AI Assistant: could not read ${file.path}`, e);
      }
    }

    return documents;
  }

  async processUploadedFile(file: File): Promise<IndexedDocument> {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const text = await this.parsePDFArrayBuffer(arrayBuffer);
      return { name: file.name, content: this.truncate(text, 50000), source: "upload" };
    }

    if (ext === "md" || ext === "txt") {
      const text = await file.text();
      return { name: file.name, content: this.truncate(text, 50000), source: "upload" };
    }

    if (ext && IMAGE_EXTENSIONS.includes(ext)) {
      const arrayBuffer = await file.arrayBuffer();
      return {
        name: file.name,
        content: `[Image File: ${file.name}]`,
        source: "upload",
        imageData: this.arrayBufferToBase64(arrayBuffer),
        mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      };
    }

    throw new Error(
      `Unsupported file type: .${ext ?? "?"}. Supported: .md, .txt, .pdf, .png, .jpg, .jpeg, .webp, .gif`
    );
  }

  async readVaultPDF(file: TFile): Promise<IndexedDocument> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const text = await this.parsePDFArrayBuffer(arrayBuffer);
    return { name: file.path, content: this.truncate(text, 50000), source: "vault" };
  }

  async readVaultImage(file: TFile): Promise<IndexedDocument> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const ext = file.extension.toLowerCase();
    return {
      name: file.path,
      content: `[Vault Image: ${file.path}]`,
      source: "vault",
      imageData: this.arrayBufferToBase64(arrayBuffer),
      mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    };
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private async parsePDFArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
    // Loaded lazily so the ~1 MB PDF.js bundle is only evaluated when a PDF is opened.
    const mod = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjsLib = ((mod as { default?: unknown }).default ?? mod) as unknown as PdfJsLib;

    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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
      const pageText = content.items
        .map((item) => (item as PdfTextItem).str ?? "")
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
