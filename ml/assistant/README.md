# Industrial AI Assistant

The existing React assistant screen is backed by the project FastAPI service;
the standalone HTML page from the source project is not used. The assistant
combines structured, non-demo machine predictions and work orders from the
current browser session with document retrieval from a local Qdrant index.

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

- PDF and UTF-8 TXT files are parsed, chunked, and embedded on the local
  machine. Scanned PDF pages use optional Arabic/English EasyOCR.
- Vectors and indexed text are stored locally under
  `ml/assistant/data/qdrant/`; they are excluded from Git. Deleting an indexed
  document deletes its vectors and extracted text from this local index.
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
  and conversation history, and plays each answer in speech chunks. It requires
  browser microphone permission and a secure browser context (HTTPS or localhost).
- Chat messages and saved conversations remain in the existing browser-local
  application state; they are not added to the vector database.

The app reports unavailable dependencies or a missing API key explicitly; it
does not silently fall back to the former simulated assistant. The local
embedding model must be downloaded before document search can work. The model
answer is decision support: verify maintenance procedures against the machine
manual and site safety rules.

## Configuration

- `GROQ_API_KEY`: required for chat, vision, and transcription.
- `CHAT_MODEL`, `VISION_MODEL`, `STT_MODEL`: provider model names.
- `EMBEDDING_MODEL`: local Sentence Transformers model; default
  `intfloat/multilingual-e5-large`.
- `QDRANT_PATH`: local vector-store path; defaults to
  `ml/assistant/data/qdrant`.
- `HF_TOKEN`: optional token for hosted speech output quotas.
- `OCR_LANGUAGES`: EasyOCR languages; default `ar,en`.

The source project's `.env`, bundled virtual environment, and standalone
`static/index.html` are intentionally not copied into this project.
