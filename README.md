# GraphIDE

A research-grade AI IDE built on a VS Code fork, designed with a **4-Plane Architecture** for advanced agentic capabilities in software development.

![Stage](https://img.shields.io/badge/Stage-1%20Complete-brightgreen)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🎯 Current Status: Stage 1 Complete

GraphIDE has completed **Stage 1: IDE Shell & IPC Foundation**, establishing the core infrastructure for AI-assisted development.

### ✅ What's Working
- VS Code fork branded as "GraphIDE"
- Custom chat panel in the Auxiliary Bar (right side)
- IPC communication with backend agent runtime
- FastAPI backend stub receiving requests
- Graceful error handling when backend is offline

## 🚀 Quick Start

### Prerequisites
- **Node.js** v22.21.1 ([nvs](https://github.com/jasongin/nvs) recommended)
- **Python** 3.10+ with pip
- **Visual Studio Build Tools 2022** (Windows, with Spectre-mitigated libs)
- **Git**

### 1. Clone & Build the IDE
```bash
git clone <repo-url>
cd graph_ide/ide
npm install
npm run compile      # Takes ~15-20 min on first build
```

### 2. Start the Backend
```bash
cd graph_ide/agent-runtime
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Launch GraphIDE
```bash
cd graph_ide/ide
.\scripts\code.bat   # Windows
./scripts/code.sh    # Linux/macOS
```

### 4. Open the GraphIDE Panel
- Look for the **GraphIDE** panel in the Auxiliary Bar (right side)
- Or press `Ctrl+Shift+P` → search "GraphIDE"

## 📁 Repository Structure

```
graph_ide/
├── ide/                    # VS Code Fork (Presentation Plane)
│   ├── src/vs/workbench/contrib/graphide/  # GraphIDE Panel
│   └── ...
├── agent-runtime/          # Python Backend (Control Plane)
│   ├── main.py             # FastAPI server
│   └── requirements.txt
├── schemas/                # IPC Contracts (JSON Schemas)
│   ├── ide_to_runtime_request.json
│   └── runtime_to_ide_response.json
├── cpg/                    # Code Property Graph (Stage 2+)
├── rag/                    # RAG Pipeline (Stage 2+)
└── docs/                   # Architecture Documentation
```

## 🏗️ Architecture

GraphIDE uses a **4-Plane Architecture**:

| Plane | Component | Technology | Status |
|-------|-----------|------------|--------|
| **Presentation** | IDE Shell | VS Code Fork (TypeScript/Electron) | ✅ Stage 1 |
| **Control** | Agent Runtime | FastAPI (Python) | ✅ Stage 1 (Stub) |
| **Cognition** | LLM Integration | Ollama/Local LLM | 🔜 Stage 2 |
| **Knowledge** | CPG + RAG | Joern + FAISS | 🔜 Stage 2 |

## 📡 IPC Schema (Stage 0)

**IDE → Runtime Request:**
```json
{
  "intent": "free_text",
  "filePath": "/path/to/file.py",
  "language": "python",
  "codeRange": { "startLine": 10, "endLine": 20 },
  "userQuery": "Explain this function"
}
```

**Runtime → IDE Response:**
```json
{
  "status": "success",
  "agentOutputs": [{
    "outputType": "markdown",
    "markdownOutput": "This function calculates..."
  }]
}
```

## 🛠️ Development

### Rebuild after changes
```bash
cd ide
npm run compile
```

### Run backend in dev mode
```bash
cd agent-runtime
uvicorn main:app --reload
```

## 📋 Roadmap

- [x] **Stage 0**: Architecture & IPC Contracts
- [x] **Stage 1**: IDE Shell & IPC Foundation
- [ ] **Stage 2**: Joern CPG Integration
- [ ] **Stage 3**: Local LLM + RAG Pipeline
- [ ] **Stage 4**: Multi-agent Workflows

## 📄 Documentation

- [Architecture](docs/architecture.md)
- [Stage 0 Decisions](docs/stage0_decisions.md)

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.
