# Multi-AI Assistant for Obsidian

An Obsidian plugin that lets you index your vault notes and uploaded files, and chat with AI models from Google Gemini, OpenAI, and Groq directly within your notes workspace. Supports Gemini CLI.

Created by [Lucy Roh](https://github.com/lucytheboss).

## Features

- **Multi-Provider Support**: Connects to Google Gemini, OpenAI, and Groq models.
- **Vault Indexing**: Index your local markdown notes and uploaded documents (like PDFs) to use them as context for AI queries.
- **Sidebar Chat Interface**: Chat with models in a dedicated sidebar view without losing context of your notes.
- **Customizable AI Characters**: Toggle between preconfigured AI avatars/characters with unique system prompts (e.g. Blip, Cinder, Cosmo, Dusk, Ember, etc.).
- **Gemini CLI Support**: Integrates with local command-line tools for Gemini-based workflows.

---

## Installation

### Manual Installation
1. Go to the [Releases](https://github.com/lucytheboss/multi-ai-assistant/releases) page and download the latest release files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create a folder named `multi-ai-assistant` inside your vault's plugins folder: `<your-vault>/.obsidian/plugins/multi-ai-assistant/`.
3. Move the downloaded files into that folder.
4. Open Obsidian and navigate to **Settings > Community plugins**. Click the refresh button, then toggle the switch next to **Multi-AI Assistant** to enable it.

---

## Development

If you'd like to build the plugin from source, follow these steps:

### Setup
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Build Scripts
- **Development Build (with watch mode)**:
  ```bash
  npm run dev
  ```
- **Production Build**:
  ```bash
  npm run build
  ```

---

## License

This project is licensed under the [MIT License](LICENSE).
