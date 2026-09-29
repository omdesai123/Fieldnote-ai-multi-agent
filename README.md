# Fieldnote — AI Research Desk

A small web app that wraps a multi-agent LangChain research pipeline in a
FastAPI backend and a plain HTML/CSS/JS frontend. Give it a topic, and four
agents work through it in sequence:

1. **Search agent** — searches the web for current, reliable sources (Tavily).
2. **Reader agent** — picks the most relevant result and scrapes it for detail.
3. **Writer chain** — drafts a structured report from everything gathered.
4. **Critic chain** — reviews the report and scores it honestly.

The frontend shows all four outputs in a tabbed "dossier" view and lets you
download the final report as a `.txt` file.

---

## Project structure

```
project/
├── main.py                 # FastAPI app — routes, request/response models
├── agents.py                # Your agent + chain definitions (LangChain)
├── pipline.py                # Orchestrates the 4-step pipeline
├── tools.py                   # web_search (Tavily) and scrape_url tools
├── requirements.txt
├── .env.example              # Copy to .env and fill in your keys
├── .gitignore
├── templates/
│   └── index.html            # Single-page frontend
└── static/
    ├── css/style.css
    └── js/script.js
```

`main.py` is the only new backend file. `agents.py`, `pipline.py`, and
`tools.py` are your original pipeline logic, unmodified.

---

## What each file does

| File | Role |
|---|---|
| `main.py` | Serves the frontend at `/`, exposes `POST /api/research` and `GET /api/health`. Runs the (blocking) pipeline in a background thread so it doesn't freeze the server. |
| `agents.py` | Builds the search and reader agents, and the writer/critic chains, on top of a local Ollama model (`llama3.1:latest` by default). |
| `pipline.py` | `run_research_pipeline(topic)` — runs the four steps in order and returns a dict with `search_results`, `scraped_content`, `report`, `feedback`. |
| `tools.py` | `web_search` (Tavily API) and `scrape_url` (requests + BeautifulSoup), used as LangChain tools. |
| `templates/index.html` | The page: topic form, progress tracker, tabbed results. |
| `static/js/script.js` | Handles the fetch call to the API, the (simulated) progress tracker, tab switching, and the download button. |
| `static/css/style.css` | Visual styling. |

---

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) installed and running locally, with the model pulled:
  ```bash
  ollama pull llama3.1:latest
  ```
  (Or switch `agents.py` to a hosted provider — see **Using a different model** below.)
- A [Tavily](https://tavily.com) API key for the search tool.

---

## Setup

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# then edit .env and add your TAVILY_API_KEY
```

`.env` variables:

| Variable | Required | Used by |
|---|---|---|
| `TAVILY_API_KEY` | Yes | `tools.py` → `web_search` |
| `MISTRAL_API_KEY` | Only if using `ChatMistralAI` | `agents.py` |
| `OPENAI_API_KEY` | Only if using an OpenAI model | `agents.py` |

---

## Running the app

Make sure Ollama is running, then:

```bash
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000** in your browser.

---

## API reference

### `GET /api/health`
Liveness check.
```json
{ "status": "ok" }
```

### `POST /api/research`
Runs the full pipeline for a topic.

Request:
```json
{ "topic": "The future of solid-state batteries" }
```

Response:
```json
{
  "topic": "The future of solid-state batteries",
  "search_results": "...",
  "scraped_content": "...",
  "report": "...",
  "feedback": "..."
}
```

A failure (bad input, model error, scrape failure, etc.) returns a 4xx/5xx
status with a `detail` field describing what went wrong.

---

## Using a different model

`agents.py` is set up for a local Ollama model by default:

```python
llm = ChatOllama(model="llama3.1:latest", temperature=0)
```

To use Mistral's hosted API instead, uncomment this line in `agents.py` and
comment out the `ChatOllama` line:

```python
llm = ChatMistralAI(model="mistral-small-latest")
```

Add `MISTRAL_API_KEY` to `.env`. Hosted models avoid local memory limits
entirely (see troubleshooting below) at the cost of API usage fees.

---

## Troubleshooting

**`ollama._types.ResponseError: llama-server process has terminated ... failed to allocate buffer`**
Ollama couldn't get enough free memory to load the model at that moment.
`llama3.1:latest` (8B) typically needs 6–8 GB of free RAM on CPU.
- Close other memory-heavy applications and retry.
- Restart the model: `ollama stop llama3.1:latest`, then retry.
- Switch to a smaller model, e.g. `ollama pull llama3.2:3b` and update
  `agents.py` accordingly.
- Or switch to a hosted model (see above) to sidestep local memory limits.

This error surfaces to the frontend as a 500 with the raw Ollama message in
the error banner — it's informative but not pretty; feel free to ask for a
friendlier message mapped to this specific failure.

**`TypeError: cannot use 'tuple' as a dict key (unhashable type: 'dict')` on `GET /`**
A version mismatch between an old-style `TemplateResponse` call and a newer
Starlette. Already fixed in `main.py` by calling:
```python
templates.TemplateResponse(request=request, name="index.html")
```
If you still see this, run `pip install -U fastapi starlette` and restart.

**Static files or styles not loading**
Make sure you're running `uvicorn` from inside the `project/` directory —
`main.py` mounts `static/` and `templates/` using relative paths.

**Search step returns nothing / errors**
Check that `TAVILY_API_KEY` is set correctly in `.env` and that the key is
active.

---

## Notes on the frontend progress tracker

The backend returns one JSON response at the end of the whole pipeline — it
does not stream intermediate steps. The four-stage tracker in the UI
(Search → Read → Draft → Review) is a **timed simulation** based on typical
stage durations, not a live status feed. It gives an honest sense of what's
happening without implying more real-time visibility than the API provides.
#
