# Project Guide

This is a source-grounded academic assistant for IIT Hyderabad Electrical Engineering. `public/` contains the static interface, styles, browser chat client, and downloadable reference PDFs. `netlify/server/index.mjs` is the Netlify Server chat endpoint, and `netlify/server/corpus.mjs` is the deploy-time snapshot of source passages used for lexical retrieval. `netlify.toml` publishes the static site and routes `/api/*` to the server.

The deployed Netlify assistant uses Netlify AI Gateway through the OpenAI SDK. The local Node.js server is in `scripts/local-server.mjs`. It supports source search and optional local generation via llama.cpp. Keep inference server-side and do not introduce client-side credentials. Conversation state is intentionally ephemeral. The source index is static reference content, not user data or a persistent chat store.

Preserve source URLs, page references, publication dates, and batch limitations when updating the corpus. The attached EE curriculum is for the 2020 batch and was last updated in February 2021. Calendar and department content are snapshots, not live-synced rules. Avoid presenting the assistant as an official IIT Hyderabad service or implying that its sources are exhaustive. Keep the interface accessible, responsive, and consistent with the existing plain JavaScript and CSS architecture.
