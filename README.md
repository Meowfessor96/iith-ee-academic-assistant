# EE Academic Assistant

A local source search and credit calculator for IIT Hyderabad Electrical Engineering students.

## Open the live app

[Launch the Academic Assistant](https://meowfessor96.github.io/iith-ee-academic-assistant/) to use the hosted chat, credit planner, and email sign-in. The GitHub Pages link opens the working Netlify build, where the account and chat services run. The hosted build predates the course browser in this repository.

## Run locally

Install Node.js 22.13 or newer. From the project directory, run:

```sh
npm ci
npm start
```

Open [EE Academic Assistant](http://127.0.0.1:3000). Set the `PORT` environment variable before starting to use a different port. The server listens on this computer only.

- **Academic assistant** looks up course and instructor assignments and returns relevant excerpts from the indexed IIT Hyderabad sources. Attach a supported document to search its text.
- **Courses & instructors** in the sidebar shows the department timetable. Search by instructor name, course code, or title, and filter by programme.
- **Credit calculator** saves progress in this browser. Review each extracted course and select only completed courses before adding them.

Local operation needs no API key or hosted service. Node.js handles the browser's `POST /api/chat` and `POST /api/extract` requests. PDF.js reads selectable PDF text on your computer. The Netlify build uses Netlify AI Gateway for chat and optional document extraction, and Netlify Identity with Netlify Database for account sync. Those services do not run with `npm start`.

## Optional local RAG mode

RAG mode searches the same course and academic sources, then gives relevant passages to a local model to compose a cited answer. Course and instructor lookups use the timetable directly. If the model is unavailable or produces no usable citation, the app shows the retrieved excerpts.

1. Download the [Windows x64 CPU build of llama.cpp](https://github.com/ggml-org/llama.cpp/releases) and the [Qwen2.5 1.5B Instruct Q4_K_M model](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF). The model file is about 1.1 GB.
2. From the folder containing the executable and model file, start the model server:

   ```powershell
   .\llama-server.exe --model .\qwen2.5-1.5b-instruct-q4_k_m.gguf --alias ee-assistant --host 127.0.0.1 --port 8081 --ctx-size 4096 --parallel 1 --cors-origins http://127.0.0.1:8081
   ```

3. In a second terminal, run `npm run start:rag` from this project and open [EE Academic Assistant](http://127.0.0.1:3000). Use `npm start` for search-only mode. If using another llama.cpp port, set `LLAMA_SERVER_PORT` before starting the app.

The project sends retrieved passages to the model over loopback. Initial model download requires internet access. Generated replies still need to be checked against their sources before making academic decisions.

## Document import

Use a text PDF of up to 30 pages, CSV, TXT, or Markdown. Files can be up to 4 MB. The local and Netlify builds read explicitly labeled credits from supported table layouts or text lines. The Netlify build can use AI extraction for an unsupported layout or an uploaded image. For a scanned PDF, export the table as CSV or upload a clear image of the relevant page to the Netlify build.

The most reliable input is a CSV with these headers:

```csv
Code,Course Name,Credits
EE1101,Circuits and Network Analysis,3
```

A plain text line can also say `EE1101 Circuits and Network Analysis — 3 credits`. If a registration PDF has an unsupported layout, export it to CSV or enter the courses manually.

## Ask about calculator progress

Choose **Ask about my credits** in the Credit Calculator for a breakdown of completed credits and remaining targets. To include calculator figures with another chat question, select **Include credit calculator totals** in the composer. Chat receives numeric totals and targets, without the underlying course entries or uploaded documents. Starting a new conversation clears the selection.

## Deploy from GitHub

The Node.js app needs a server for its chat and document endpoints. To host the search-only app, deploy the Dockerfile to a container host or run:

```sh
docker build -t ee-assistant .
docker run --rm -p 127.0.0.1:3000:3000 ee-assistant
```

The server respects `HOST` and `PORT`. For a public deployment, use your hosting provider's HTTPS proxy and preserve the original Host header. Local RAG mode requires a llama.cpp server on the same loopback interface. GitHub Actions runs the local integration test and checks the container build.

You can also connect this repository to Netlify for the hosted AI Gateway version. The repository's `netlify.toml` handles the build and API routing. That deployment needs a Netlify project with AI Gateway available, plus Identity and Database if you want account sync.

## Academic sources

The [official EE timetable](https://ee.iith.ac.in/Courses/current_timetable.html) covers August–November 2026 and was updated by the department on 23 August 2026. The app uses a snapshot checked on 18 November 2026. It includes EE B.Tech, ICDT B.Tech, and M.Tech/PG offerings and shows where the timetable leaves instructor names unspecified.

The supplied EE curriculum is a February 2021 reference for the 2020 B.Tech batch. The indexed calendar and department passages are dated snapshots. Verify important academic decisions with the Academic Office.

Update the timetable data and metadata in `public/current-courses.js` for the sidebar and local instructor lookups. Update `netlify/server/timetable.mjs` for the detailed course and slot excerpts. The academic reference corpus is in `netlify/server/corpus.mjs`, with supporting PDFs in `public/documents`. Preserve the source URLs and snapshot dates.
