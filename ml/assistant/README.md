# Industrial AI Assistant

The existing React assistant screen is backed by the project FastAPI service;
the standalone HTML page from the source project is not used. The assistant
combines structured, non-demo machine predictions and work orders from the
current browser session with document retrieval from a persistent Qdrant index.

## Install and configure

From the repository root, in the same Python environment used by the ML API:

```powershell
npm run setup:assistant
Copy-Item .env.example .env
```

Add the Groq API key to the ignored, local `.env` file:

```text
GROQ_API_KEY=your_key
```

Do not commit `.env`. Assistant dependencies are optional and separate from
the maintenance prediction service. `npm run setup:assistant` installs the
local multilingual embedding model runtime, Qdrant client, PDF parser, Arabic
OCR, and speech client dependencies. The first upload or search downloads the
`intfloat/multilingual-e5-large` embedding model (about 2 GB); Arabic/English
OCR model weights are downloaded only when a scanned PDF needs OCR.

Start the usual application with `npm run dev`. The assistant health endpoint
is `GET /api/assistant/health`.

## Data, retrieval, and supported files

- PDF and UTF-8 TXT files are parsed, chunked, and embedded by the backend.
  Scanned PDF pages use optional Arabic/English EasyOCR.
- Local development stores vectors and indexed text under
  `ml/assistant/data/qdrant/`; this directory is excluded from Git. On Vercel,
  configure `QDRANT_URL` and `QDRANT_API_KEY` for persistent Qdrant Cloud
  storage. The assistant refuses to silently use an ephemeral local index on
  Vercel. Deleting an indexed document removes its vectors from the active
  Qdrant collection.
- The assistant retrieves relevant passages with multilingual E5 embeddings
  and Qdrant, then asks the configured Groq chat model to answer. Responses
  include retrieved document names and page numbers when available.
- Current model outputs are included only for machines with fresh,
  user-provided model inputs. Demo predictions, illustrative sensor display
  values, and demo work orders are excluded from the operational context.
- Optional image analysis and audio transcription send the selected image or
  recording to Groq. Speech output sends the response text to the configured
  hosted Gradio TTS Space. Text questions and retrieved document passages are
  sent to Groq for answer generation.
- Live voice chat keeps the microphone active during the call, detects pauses
  between turns, transcribes each question, uses the selected project context
  and conversation history, and plays concise, language-matched answers in
  speech chunks. It uses the hosted TTS service when available and falls back
  to a matching installed browser speech voice if that service is unavailable.
  If no matching voice is installed, it keeps the answer visible as text and
  reports that speech output is unavailable. It requires browser microphone
  permission and a secure browser context (HTTPS or localhost).
- The optional **Think** composer toggle asks the assistant to compare available
  evidence and check uncertainty before answering, without exposing private
  chain-of-thought. It applies to text, image, and live voice questions.
- Chat messages and saved conversations remain in the existing browser-local
  application state; they are not added to the vector database.

The app reports unavailable dependencies or a missing API key explicitly; it
does not silently fall back to the former simulated assistant. The embedding
model must be downloaded before document search can work. On Vercel it is
cached only in `/tmp` for a function instance's lifetime, so cold instances
may download the approximately 2 GB model again. The model answer is decision
support: verify maintenance procedures against the machine manual and site
safety rules.

## Configuration

- `GROQ_API_KEY`: required for chat, vision, and transcription.
- `CHAT_MODEL`, `VISION_MODEL`, `STT_MODEL`: provider model names.
- Chat and image answers follow the language of the current question (Arabic
  or English). `STT_LANGUAGE` is optional; when unset, transcription detects
  Arabic or English automatically.
- `VOICE_CHAT_MODEL`: optional model for concise live voice responses.
- `TTS_LANGUAGE` is optional; when unset, spoken replies use Arabic or English
  based on the response text. Set it only to force a specific speech language.
- `EMBEDDING_MODEL`: local Sentence Transformers model; default
  `intfloat/multilingual-e5-large`.
- `QDRANT_URL` and `QDRANT_API_KEY`: required together on Vercel for persistent
  Qdrant Cloud storage. The URL must use HTTPS. If both are omitted locally,
  `QDRANT_PATH` selects the local file-backed index (default:
  `ml/assistant/data/qdrant`).
- `HF_TOKEN`: optional token for hosted speech output quotas.
- `OCR_LANGUAGES`: EasyOCR languages; default `ar,en`.

For Vercel, add `GROQ_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY` to the
project's Production and Preview environment variables; local `.env` files are
not uploaded automatically. The backend service installs these assistant
dependencies in addition to the ML dependencies, with CPU-only PyTorch wheels.
Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` in Vercel if the resulting Python bundle
exceeds its standard 500 MB limit; this feature must be available to the
project. The embedding model used about 1.7 GB of memory locally, so verify
deployment memory limits (Vercel Hobby functions are limited to 2 GB; Pro and
Enterprise can use up to 4 GB). Vercel limits function request bodies to
4.5 MB, so documents, images, and audio are capped at 4 MB on Vercel and retain
their larger local limits.

The source project's `.env`, bundled virtual environment, and standalone
`static/index.html` are intentionally not copied into this project.
