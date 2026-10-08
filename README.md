# Open Farloret 🌹

Scarlet development stage — a self-hosted, original AI chat workspace inspired by the usability of Open WebUI, without copying its source code, visual assets or identity.

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
