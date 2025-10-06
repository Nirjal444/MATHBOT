import os
import asyncio
import json
from typing import Any
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv

import openai
try:
    # New OpenAI client interface (openai>=1.0.0)
    from openai import OpenAI as OpenAIClient
except Exception:
    OpenAIClient = None


load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
# If USE_MOCK is true, the server will return canned answers and not call OpenAI
USE_MOCK = str(os.getenv("USE_MOCK", "false")).lower() in ("1", "true", "yes")
if OPENAI_API_KEY:
    # keep the old openai attribute for compatibility, and create new client when available
    try:
        openai.api_key = OPENAI_API_KEY
    except Exception:
        pass

# instantiate modern client when possible
client = None
if OpenAIClient is not None:
    try:
        # OpenAIClient will pick up env var automatically, but pass key if present
        client = OpenAIClient(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else OpenAIClient()
    except Exception:
        client = None


# Configure a simple logger and emit startup info so you can verify env vars
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mathbot.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # Don't print the secret itself; just indicate whether it is present
    key_present = bool(OPENAI_API_KEY)
    logger.info(f"OPENAI_API_KEY present: {key_present}")
    logger.info(f"OPENAI_MODEL: {OPENAI_MODEL}")
    logger.info(f"USE_MOCK: {USE_MOCK}")
    yield
    # Shutdown (if needed)


app = FastAPI(lifespan=lifespan)

# Serve the static frontend
app.mount("/static", StaticFiles(directory="./static"), name="static")


@app.get("/")
async def index():
    html_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


async def call_openai_chat(prompt: str) -> dict[str, Any]:
    """
    Call OpenAI ChatCompletion API to generate a structured response.
    Returns a dict with keys 'explanation' and 'speech'.
    """
    if not OPENAI_API_KEY:
        # Fallback: return a canned response explaining missing key
        return {
            "explanation": "OpenAI API key not set on server. Please set OPENAI_API_KEY in the environment to enable LLM responses. Example: export OPENAI_API_KEY=your_key",
            "speech": "Open A I key not set on the server. Please set it and restart the server.",
        }

    # If developer requested mock mode, return a safe canned response (no quota used)
    if USE_MOCK:
        return {
            "explanation": "(Mock) The derivative of x^2 is 2x. In general, d/dx x^n = n x^{n-1}.",
            "speech": "Mock answer: the derivative of x squared is two x.",
        }

    system_prompt = (
        "You are an expert undergraduate mathematics tutor.\n"
        "When given a user question, respond with a JSON object with two keys: 'explanation' and 'speech'.\n"
        "- 'explanation' should contain the full detailed explanation. You may include LaTeX delimiters (like $...$ or $$...$$) where appropriate.\n"
        "- 'speech' should be a concise, clear spoken explanation suitable for text-to-speech (no LaTeX markup).\n"
        "Always return valid JSON and nothing else. If you must include code or math, ensure the 'speech' field remains plain text.\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    # Use the OpenAI Python client in a thread to avoid blocking the event loop.
    # Prefer the new client interface if available, otherwise attempt the older API.
    def sync_call():
        # Allow model override via environment variable
        model = OPENAI_MODEL
        if client is not None:
            # new-style client
            return client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                max_tokens=800,
            )
        else:
            # fallback to older openai package interface if installed
            return openai.ChatCompletion.create(
                model=model,
                messages=messages,
                temperature=0.2,
                max_tokens=800,
            )

    try:
        resp = await asyncio.to_thread(sync_call)
        # support multiple possible response shapes between library versions
        content = None
        try:
            # new-style: resp.choices[0].message.content or dict-like
            try:
                content = resp["choices"][0]["message"]["content"]
            except Exception:
                # object attribute style
                content = resp.choices[0].message.content
        except Exception:
            # last resort: try other common shape
            try:
                content = resp["choices"][0]["text"]
            except Exception:
                content = str(resp)
        # The assistant is instructed to return JSON; parse it.
        try:
            parsed = json.loads(content)
            # ensure keys exist
            explanation = parsed.get("explanation") or parsed.get("explain") or content
            speech = parsed.get("speech") or parsed.get("speak") or explanation
            return {"explanation": explanation, "speech": speech}
        except Exception:
            # If parsing fails, return the raw content in 'explanation' and a fallback 'speech'
            return {"explanation": content, "speech": content}
    except Exception as e:
        errmsg = str(e)
        # Provide a clearer message for quota errors
        if "insufficient_quota" in errmsg or "quota" in errmsg or "429" in errmsg:
            user_msg = (
                "OpenAI returned a quota error (insufficient quota or rate limit). "
                "Check your OpenAI plan/billing and consider setting OPENAI_MODEL=gpt-3.5-turbo or enabling USE_MOCK=true for testing."
            )
            return {"explanation": f"OpenAI request failed: {errmsg}", "speech": user_msg}
        return {"explanation": f"OpenAI request failed: {errmsg}", "speech": "Sorry, I could not reach the language model."}


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                text = payload.get("text", "")
                msg_id = payload.get("id")
            except Exception:
                text = data
                msg_id = None

            # Call OpenAI and send back structured response
            result = await call_openai_chat(text)
            outgoing = {"id": msg_id, "response": result}
            await websocket.send_text(json.dumps(outgoing))

    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
