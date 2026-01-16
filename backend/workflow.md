Below is the **mechanically precise execution plan** that turns the previously defined **CPGxLLM-D VSCode-fork IDE on OnDemand** into a **deliverable hackathon system**.

Nothing here is invented. Everything is directly mapped to the architecture you approved earlier.

---

# **1. Architecture Inventory**

### **A. Client / IDE Layer**

```
VSCode Fork
 ├─ File Watcher
 ├─ “Analyse File(s)” Command
 ├─ Gutter Line Highlighter
 ├─ Analysis Panel
 ├─ API Client (Backend)
 └─ Patch Applier Agent (Local)
```

---

### **B. Backend Services (API Gateway)**

```
API Gateway
 ├─ /scan (selected code files being sent to the OnDemand Query Agent)
 ├─ /chat (sends the code/query to the respective Q OR D Models, the nanobanana agent, the report agent)
 ├─ /media (sends the request to the Gemini agent on OnDemand to build the vulnerability visualisations)
 ├─ /slice (sends the code and the query generated from the Q model to joern)
 └─ /verify (verifies the patches made by the D model for syntactical errors etc.)
```

---

### **C. Agents & Models**

```
1. Editor Agent (IDE Trigger)
2. LLMxCPG Model - Q (Query Generation)
3. LLMxCPG Model - D (Detection & Patching)
4. Knowledge Agent (CVE/CWE Enrichment)
5. NanoBanana Agent (Flowchart/Dataflow Explanation)
6. Patch Applier Agent (Local VSCode Integration)
7. LLM Agent (Report Chat)
```

---

### **D. OnDemand Services & Tools**

```
1. CHAT API (Orchestrator)
2. Joern (CPG Slicing)
3. Media API (Image handling for Flowcharts)
4. AST Patch Verifier (Custom Tool)
5. Report Builder (Custom Tool)
6. Vector DB (Knowledge Store)
```

---

### **E. Data & Storage**

```
Joern CPG Graph Store
Flowchart Images (Backend/Media)
Vulnerability Reports (PDF)
CVE/CWE Knowledge Base (Vector DB)
```

---

# **2. System Flow (End-to-End)**

1. Developer clicks the analyse button next to the chat button and picks file(s) to send to the backend for scanning in the **VSCode fork**
2. Backend calls the **CHAT API** that is hosted on OnDemand via /chat
3. CHAT API calls the **LLMxCPG Model - Q** and passes in the code and returns the CPG Query back to the CHAT API then back to the backend
4. Backend sends code + CPG Query to **Joern** on OnDemand
5. Joern returns the sliced code back to the backend
6. Sliced code is passed to the LLMxCPG Model - D for evaluation and patch fix generation and at the same time it is passed to the knowledge agent for cve/cwe knowledge enrichment the combined output of the two is returned to the backend via /chat
7. Sliced code along with the vulnerability evaluation is sent to the NanoBanana agent /chat to generate a flowchart type vulnerability explanation showing data flow and where the code is flawed, generated flowchart image is stored on the backend
8. The flowchart image stored on the backend is sent to the Media API on OnDemand which sends the image back to the backend and then it is displayed to the frontend via a button press
9. The generated code patch is sent to the AST Patch Verifier tool on OnDemand (uses OpenAPISchema on OnDemand for the custom tool)
10. The verified code patch is sent back to the backend and then sent to the Patch Applier Agent(locally) which applies the patches in a typical native vscode way
11. code patch and explanation along with sliced code via /chat is sent to the Report Builder tool on OnDemand via /chat to generate a descriptive pdf on the vulnerability, fix and the patch
12. Finally the generated pdf is sent to a LLM agent on OnDemand via /chat through which the user can chat about the pdf and the vulnerabilities in the code, ask questions etc.

---

# **3. Component Decomposition**

### **IDE (VSCode Fork)**

*   **Analysis/Chat UI**: Trigger for Scan, Display for Flowchart & PDF.
*   **Patch Applier Agent**: Local agent running within VSCode to apply verified patches directly to the source code.

---

### **Backend APIs**

| Endpoint | Purpose |
| :--- | :--- |
| `/scan` | Initial scan trigger; sends selected files to OnDemand. |
| `/chat` | Central orchestration: routes to Q/D Models, NanoBanana, Report tools. |
| `/slice` | Orchestrates code slicing via Joern using generated queries. |
| `/media` | Requests visualization generation (flowcharts) from Gemini/Media agent. |
| `/verify`| Validates generated patches for syntax and logic errors. |

---

### **Agents & Tools**

| Component | Responsibility |
| :--- | :--- |
| **LLMxCPG Model - Q** | Generates CPG Queries based on input code. |
| **LLMxCPG Model - D** | Evaluates sliced code, identifies vulnerabilities, and generates fixes. |
| **Knowledge Agent** | Enriches findings with CVE/CWE data and educational context. |
| **NanoBanana Agent** | generated flowchart type vulnerability explanation. |
| **Patch Applier Agent** | Applies fixes locally in the IDE. |
| **LLM Agent** | RAG-based chat interface for the generated Vulnerability Report PDF. |

---

### **OnDemand Custom Tools**

| Tool | Responsibility |
| :--- | :--- |
| **AST Patch Verifier** | Validates syntax and structural correctness of generated patches using `OpenAPISchema`. |
| **Report Builder** | Compiles findings, slices, flowcharts, and patches into a PDF. |
| **Media API** | Handles storage and retrieval of generated flowchart images. |

---

# **4. Team Assignment Matrix**

| Component | Engineer |
| :--- | :--- |
| VSCode Fork & Patch Applier | **A** |
| Backend & Chat API Orchestration | **B** |
| Joern & CPG Pipeline | **B** |
| NanoBanana Agent & Media API | **C** |
| AST Patch Verifier | **C** |
| Report Builder | **C** |
| Models (Q & D) Integration | **C** |

---

# **5. Phased Execution**

### **Phase 1: Core Analysis Loop**
*   VSCode -> /scan -> Backend
*   Backend -> /chat -> Model Q
*   Model Q -> /slice -> Joern

### **Phase 2: Detection & Enrichment**
*   Slice -> /chat -> Model D (Fix Gen)
*   Slice -> /chat -> Knowledge Agent (Enrichment)

### **Phase 3: Visualization & Verification**
*   Findings -> /chat -> NanoBanana Agent (Flowchart)
*   Flowchart -> /media -> Frontend
*   Fix -> /verify -> AST Patch Verifier

### **Phase 4: Synthesis & Reporting**
*   All Data -> /chat -> Report Builder (PDF)
*   PDF -> /chat -> LLM Agent (Chat)
*   Verified Fix -> Patch Applier (Local Apply)

---

# **6. Summary**

This updated flow introduces a highly agentic architecture where specific agents (NanoBanana, Knowledge, Local Applier) and tools (Verifier, Report Builder) handle specialized tasks, coordinated via a central Chat API on the Backend. This ensures:
1.  **Visual Clarity**: Via NanoBanana flowcharts.
2.  **Code Integrity**: Via AST Patch Verifier.
3.  **Comprehensive Reporting**: Via Report Builder & PDF Chat.
4.  **Seamless UX**: Via Local Patch Applier.
