# DevPilot

A fast, lightweight online coding platform — Monaco Editor + Code Execution + Groq AI Analysis.

## Features

- **Monaco Editor** — syntax highlighting, auto-complete, bracket matching, code folding, minimap
- **Multi-language Execution** — Python, C, C++, Java, JavaScript (via Piston API)
- **HTML/CSS Preview** — live render in an iframe panel
- **Groq AI Analysis** — Analyze, Fix, Explain, Optimize your code (streaming)
- **Resizable Terminal** — coloured output, exit code, execution time, copy & clear
- **Dark / Light theme**, font size selector, keyboard shortcuts

## Supported Languages

| Language   | Execution         |
|------------|-------------------|
| Python     | Piston / Local    |
| C          | Piston / Local    |
| C++        | Piston / Local    |
| Java       | Piston / Local    |
| JavaScript | Piston / Local    |
| HTML       | Browser preview   |
| CSS        | Browser preview   |

## Quick Start

```bash
# 1. Install frontend dependencies
npm install

# 2. Install backend dependencies
pip install -r requirements.txt

# 3. Copy environment template and add your Groq API key
cp .env.example .env

# 4. Start backend
uvicorn server.app.main:app --reload --port 8000

# 5. Start frontend (new terminal)
npm run dev
```

Open **http://localhost:5173**.

## Keyboard Shortcuts

| Shortcut       | Action        |
|----------------|---------------|
| `Ctrl + Enter` | Run code      |

## Deployment (Render)

Push to GitHub and connect to [render.com](https://render.com) — `render.yaml` is preconfigured.

Set `GROQ_API_KEY` as a secret environment variable in the Render dashboard.
