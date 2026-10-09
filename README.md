# Open Farloret 🌹

Scarlet development stage — a self-hosted, original AI chat workspace inspired by the usability of Open WebUI, without copying its source code, visual assets or identity.

## Custom model selector

Both the public preview and Node app use an original in-page model menu instead of the browser's native select popup. Keyboard controls include arrows, Home/End, Enter/Space, Escape, Tab and type-to-search. Model names are rendered as text, and the self-hosted app still discovers live provider models. The public preview contains only the silent Blank model.

Source: [model-picker.js](public/model-picker.js) · [model-picker.css](public/model-picker.css).

## Interface icons

The custom UI icons live in [`public/assets/ui-icons.svg`](public/assets/ui-icons.svg). Both the public Pages preview and the self-hosted Node interface share these 24×24 glyphs for chat navigation, history actions, appearance, and sending. They are distinct from the official Scarlet brand logo, which is not modified.

## Scarlet logo

The original official Scarlet PNG is stored at [`public/assets/scarlet-logo.png`](public/assets/scarlet-logo.png) and is reused without alteration for both interfaces and favicons. GitHub Pages copies it into the deployed site.

## Try Scarlet in your browser (public demo)

**[Open the Scarlet public UI demo](https://farloret.github.io/open-farloret/)**

The GitHub Pages version is a **static preview**, not the Node.js server. It uses a separate, neutral white/gray interface inspired by contemporary chat workspaces, with a single **Blank · No response** model. You can test the chat composer, search, stars, rename/delete, dark mode, and export. Blank deliberately never generates an assistant reply.

Your demo chats are stored only in that browser's local storage. They are not shared with other visitors and no AI APIs are called. Clear browser data to reset the preview.

The Pages preview is built and deployed by [GitHub Actions](.github/workflows/pages.yml) on pushes to `main` that change `pages/` or the deployment workflow; it can also be run manually.

**One-time setup if Pages is not already enabled:** repository **Settings → Pages → Build and deployment → Source → GitHub Actions**. GitHub's default workflow token cannot enable a disabled Pages site on its own. Then run **Actions → Publish Scarlet demo to GitHub Pages → Run workflow** if needed. The preview URL works only after the first successful Pages deployment.

This demo contains no secrets and does not expose the self-hosted model provider.

## Run

Requires Node.js 20+ and an Ollama instance or OpenAI-compatible endpoint.

```sh
npm start
```

Open http://127.0.0.1:3000.

Defaults to Ollama's OpenAI-compatible API at `http://127.0.0.1:11434/v1`. To use another endpoint:

```sh
OPENAI_BASE_URL=https://example.com/v1 OPENAI_API_KEY=your-key npm start
```

Features: responsive sidebar, searchable conversations, original scarlet branding, light/dark theme, model discovery, streaming AI responses, and a server-side proxy that keeps provider API keys off the client.

**Limitations:** This first GitHub bootstrap uses in-memory conversations (they are lost on restart). No multi-user authentication. Bind to loopback by default. Do not expose publicly without authentication and TLS. This is early-stage software.

License: MIT (see LICENSE).
