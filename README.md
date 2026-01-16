# Graphide 🛡️

*The Verification Pipeline for the Age of AI Vibe Coding.*
Turn AI-assisted development from an opaque risk into a provable, inspectable, and compliant security workflow.

---

## 🚨 The Problem: The "Vibe Coding" Security Gap

AI-assisted coding enables developers to ship software at breakneck speeds, but it has created a massive credibility gap in security.

* *Traditional Vulnerability Scanners:* Overwhelms teams with false positives and lacks context and dataflow.
* *LLM Chatbots:* Hallucinate vulnerabilities, suggest syntactically invalid fixes, and provide zero proof of correctness.

This creates a high-risk workflow where a single AI-suggested patch can silently introduce exploitable flaws with no audit trail.

## 💡 The Solution: Graphide

Graphide is not another chatbot. It is a *deterministic verification pipeline*.

Instead of feeding raw, noisy code into an LLM, Graphide uses *Code Property Graphs (CPGs)* to extract precise vulnerability slices—removing up to *90% of irrelevant code* before analysis.

Powered by the *OnDemand Platform, our multi-agent swarm detects vulnerabilities, explains root causes, generates fixes, and—crucially—validates them using a custom AST-based patch verifier*. We provide visual dataflow graphs as proof, not just opinions.

---

## 🏗️ Architecture & Pipeline

Graphide operates as a multi-stage verification loop orchestrated via the OnDemand Platform.

### The Workflow (Step-by-Step)

1. *Ingestion:* The developer submits code (or a file) via the Graphide Frontend.
2. *Query Generation (Agent 1 - FineTuned Model-Q):* The backend sends the code to *Model-Q* on OnDemand. It doesn't guess; it generates a precise CPG query tailored to the code structure.
3. *CPG Slicing (Joern):* The query is executed against *Joern* (hosted on OnDemand), which extracts a code slice containing only the code paths relevant to potential vulnerabilities.
4. *Detection & Context (Agent 3 - FineTuned Model-D & Agent 4 - Knowledge Agent):*
* The clean slice is sent to *Model-D* (OnDemand Chat API).
* The *Knowledge Agent* enriches the findings with real-time CVE/CWE data and historical examples, ensuring high-context analysis.


5. *Fix Verification (Custom Tool - AST Verifier):*
* Before showing any fix to the user, the suggested patch is passed through our custom *AST Patch Verifier*.
* This tool parses the Abstract Syntax Tree to ensure the fix is syntactically valid and structurally sound. Broken AI code is rejected before it reaches the IDE.

6. *Automated Patch Application*.
* The verified patch is applied to the code automatically.

7. *Visual Proof (Agent 2 - NanoBanana & Media API):*
* The verified dataflow is sent to the *Media API*.
* *NanoBanana (Agent 2)* generates a clear, visual flowchart explaining exactly how the data flows from source to sink, providing visual proof of the vulnerability.


8. *Reporting (Report Agent):* A dedicated agent compiles all findings, chat context, and visual graphs into an audit-ready report for compliance teams.

---

## ⚡ Key Features

* *🔍 Precision Slicing:* Uses Code Property Graphs (CPGs) to focus LLMs only on the relevant 10% of code, drastically reducing hallucinations.
* *✅ AST Verification:* The first "Compiler-in-the-Loop" for AI security. We never suggest code that doesn't parse.
* *📊 Visual Proof:* Don't just read about a bug—see the dataflow diagram generated instantly for every finding.
* *🤖 OnDemand Swarm:* A coordinated team of 4+ specialized agents (Query, Detection, Visualization, Reporting) working in parallel.
* *📜 Compliance Ready:* Automatically generates detailed audit trails, bridging the gap between fast dev teams and strict security ops.

---

## 🛠️ Technology Stack

* *Orchestration:* [OnDemand Platform](https://on-demand.io/)
* *Agents:*
* *Model-Q:* Query Generation Specialist
* *Model-D:* Vulnerability Detection Specialist
* *NanoBanana:* Data Visualization Specialist
* *Knowledge Agent:* RAG/Context Specialist


* *Static Analysis:* Joern (Code Property Graph generator)
* *Verification:* Custom Python AST Parser
* *APIs:* OnDemand Chat API, OnDemand Media API
* *Frontend:* Typescript/Electron.JS

---

## 🚀 Getting Started

### Prerequisites

* Node.js & npm
* Python 3.9+
* OnDemand API Key
* Joern (Installed locally or via Docker)

### Installation

1. *Clone the repository:*
bash
git clone https://github.com/yourusername/graphide.git
cd graphide




2. *Setup Backend:*
bash
cd backend
pip install -r requirements.txt
export ONDEMAND_API_KEY="your_key_here"
uvicorn main:app --reload




3. *Setup Frontend:*
bash
cd frontend
npm install
npm run dev




4. *Run Joern Server:*
(Ensure Joern is running on port 9000)
bash
./joern --server





---

## 🏆 Hackathon Track: OnDemand

Graphide creates a complete ecosystem using the OnDemand platform features:

* *Multi-Agent System:* Orchestrates Model-Q, Model-D, NanoBanana, and Knowledge Agents.
* *Custom Tool Integration:* Implements a custom *AST Patch Verifier* to validate AI outputs.
* *API Usage:* Deep integration with *Chat API* for inference and *Media API* for generating security graph visualizations.

---

## 📄 License

Distributed under the MIT License. See LICENSE for more information.

---

Built with ❤️ by the Trust1ssues Team.
