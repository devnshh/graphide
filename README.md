# Graphide 🛡️

_The Verification Pipeline for the Age of AI Vibe Coding._
Turn AI-assisted development from an opaque risk into a provable, inspectable, and compliant security workflow.

---

## 🚨 The Problem: The "Vibe Coding" Security Gap

AI-assisted coding enables developers to ship software at breakneck speeds, but it has created a massive credibility gap in security.

- _Traditional Vulnerability Scanners:_ Overwhelms teams with false positives and lacks context and dataflow.
- _LLM Chatbots:_ Hallucinate vulnerabilities, suggest syntactically invalid fixes, and provide zero proof of correctness.

This creates a high-risk workflow where a single AI-suggested patch can silently introduce exploitable flaws with no audit trail.

## 💡 The Solution: Graphide

Graphide is not another chatbot. It is a _deterministic verification pipeline_.

Instead of feeding raw, noisy code into an LLM, Graphide uses _Code Property Graphs (CPGs)_ to extract precise vulnerability slices—removing up to _90% of irrelevant code_ before analysis.

Powered by the _OnDemand Platform, our multi-agent swarm detects vulnerabilities, explains root causes, generates fixes, and—crucially—validates them using a custom AST-based patch verifier_. We provide visual dataflow graphs as proof, not just opinions.

---

## 🏗️ Architecture & Pipeline

Graphide operates as a multi-stage verification loop orchestrated via the OnDemand Platform.

### The Workflow (Step-by-Step)

1. _Ingestion:_ The developer submits code (or a file) via the Graphide Frontend.
2. _Query Generation (Agent 1 - FineTuned Model-Q):_ The backend sends the code to _Model-Q_ on OnDemand. It doesn't guess; it generates a precise CPG query tailored to the code structure.
3. _CPG Slicing (Joern):_ The query is executed against _Joern_ (hosted on OnDemand), which extracts a code slice containing only the code paths relevant to potential vulnerabilities.
4. _Detection & Context (Agent 3 - FineTuned Model-D & Agent 4 - Knowledge Agent):_

- The clean slice is sent to _Model-D_ (OnDemand Chat API).
- The _Knowledge Agent_ enriches the findings with real-time CVE/CWE data and historical examples, ensuring high-context analysis.

5. _Fix Verification (Custom Tool - AST Verifier):_

- Before showing any fix to the user, the suggested patch is passed through our custom _AST Patch Verifier_.
- This tool parses the Abstract Syntax Tree to ensure the fix is syntactically valid and structurally sound. Broken AI code is rejected before it reaches the IDE.

6. _Automated Patch Application_.

- The verified patch is applied to the code automatically.

7. _Visual Proof (Agent 2 - NanoBanana & Media API):_

- The verified dataflow is sent to the _Media API_.
- _NanoBanana (Agent 2)_ generates a clear, visual flowchart explaining exactly how the data flows from source to sink, providing visual proof of the vulnerability.

8. _Reporting (Report Agent):_ A dedicated agent compiles all findings, chat context, and visual graphs into an audit-ready report for compliance teams.

---

## ⚡ Key Features

- _🔍 Precision Slicing:_ Uses Code Property Graphs (CPGs) to focus LLMs only on the relevant 10% of code, drastically reducing hallucinations.
- _✅ AST Verification:_ The first "Compiler-in-the-Loop" for AI security. We never suggest code that doesn't parse.
- _📊 Visual Proof:_ Don't just read about a bug—see the dataflow diagram generated instantly for every finding.
- _🤖 OnDemand Swarm:_ A coordinated team of 4+ specialized agents (Query, Detection, Visualization, Reporting) working in parallel.
- _📜 Compliance Ready:_ Automatically generates detailed audit trails, bridging the gap between fast dev teams and strict security ops.

---

## 🛠️ Technology Stack

- _Orchestration:_ [OnDemand Platform](https://on-demand.io/)
- _Agents:_
- _Model-Q:_ Query Generation Specialist
- _Model-D:_ Vulnerability Detection Specialist
- _NanoBanana:_ Data Visualization Specialist
- _Knowledge Agent:_ RAG/Context Specialist

- _Static Analysis:_ Joern (Code Property Graph generator)
- _Verification:_ Custom Python AST Parser
- _APIs:_ OnDemand Chat API, OnDemand Media API
- _Frontend:_ Typescript/Electron.JS

---

## 🚀 Getting Started

### Prerequisites

- Node.js & npm
- Python 3.9+
- OnDemand API Key
- Joern (Installed locally or via Docker)

### Installation

1. _Clone the repository:_
   bash
   git clone https://github.com/yourusername/graphide.git
   cd graphide

2. _Setup Backend:_
   bash
   cd backend
   pip install -r requirements.txt
   export ONDEMAND_API_KEY="your_key_here"
   uvicorn main:app --reload

3. _Setup Frontend:_
   bash
   cd frontend
   npm install
   npm run dev

4. _Run Joern Server:_
   (Ensure Joern is running on port 9000)
   bash
   ./joern --server

---

## 🏆 Hackathon Track: OnDemand

Graphide creates a complete ecosystem using the OnDemand platform features:

- _Multi-Agent System:_ Orchestrates Model-Q, Model-D, NanoBanana, and Knowledge Agents.
- _Custom Tool Integration:_ Implements a custom _AST Patch Verifier_ to validate AI outputs.
- _API Usage:_ Deep integration with _Chat API_ for inference and _Media API_ for generating security graph visualizations.

---

## 📄 License

Distributed under the MIT License. See LICENSE for more information.

---

Built with ❤️ by the Trust1ssues Team.
