# MathBot

MathBot — a small demo app: speak or type undergraduate-level math questions and receive an explained answer spoken back to you.

Features:
- Simple FastAPI backend that proxies chat requests to OpenAI's Chat API.
- Web frontend with speech-to-text (Web Speech API) and text-to-speech (SpeechSynthesis).
- Math rendering with MathJax for LaTeX in explanations.

Requirements:
- Python 3.11+
- An OpenAI API key saved to the environment variable `OPENAI_API_KEY` to enable LLM responses.

Quick start:

1. Create a virtual environment and install dependencies (we recommend pip):

	python -m venv .venv
	source .venv/bin/activate
	pip install fastapi uvicorn openai python-dotenv jinja2 httpx

2. Set your OpenAI API key in the environment:

	export OPENAI_API_KEY="sk-..."

3. Run the server:

	python server.py

4. Open http://localhost:8000 in your browser. Click the microphone or type a question.

Notes and limitations:
- If `OPENAI_API_KEY` is not set, the server will return a helpful message instead of querying the LLM.
- The frontend uses browser APIs (SpeechRecognition and SpeechSynthesis) which require modern browsers and user permission for the microphone.
- For production use, add proper authentication, rate-limiting, and host behind TLS.
