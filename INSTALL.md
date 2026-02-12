# Graphide Installation Guide

This guide details how to set up the Graphide environment on a fresh machine (macOS/Linux).

## 1. Prerequisites

Ensure you have the following installed:

- **Docker Desktop**: Required for running Joern and Neo4j databases.
  - [Install Docker](https://docs.docker.com/get-docker/)
- **Python 3.10+**: For the backend API.
  - Check version: `python3 --version`
- **Node.js 18+ & npm**: For building the IDE and webview.
  - Check version: `node -v`
- **Visual Studio Code**: Recommended for development.

---

## 2. Backend Setup

The backend manages analysis (Joern), graph storage (Neo4j), and AI models.

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Environment Configuration:**
    Create a `.env` file in the `backend` directory with the following content:
    ```bash
    # LLM Configuration
    GEMINI_API_KEY="your_api_key_here"  # Get from Google AI Studio
    MODEL_Q_URL="https://your-model-q-url"     # Optional
    
    # Neo4j Configuration
    NEO4J_URI="bolt://localhost:7687"
    NEO4J_USER="neo4j"
    NEO4J_PASSWORD="graphide123"

    # Joern Configuration
    JOERN_PORT=8080
    JOERN_HOST="localhost"
    ```

3.  **Start Database Services:**
    Launch Joern and Neo4j containers:
    ```bash
    # If you have docker-compose
    docker-compose up -d

    # OR if using newer Docker versions
    docker compose up -d
    ```
    *Ensure ports 7474, 7687 (Neo4j) and 8080 (Joern) are free.*

4.  **Python Environment:**
    Create a virtual environment and install dependencies:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

5.  **Run the Backend Server:**
    ```bash
    python main.py
    ```
    The server will start at `http://127.0.0.1:8000`.

---

## 3. IDE Setup

The IDE is a custom VS Code distribution (OSS).

1.  **Navigate to the IDE directory:**
    ```bash
    cd ../ide
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *Note: This may take a few minutes.*

3.  **Build the Webview (React Frontend):**
    The React interface must be built before running the extension.
    ```bash
    cd webview-ui
    npm install
    npm run build:webview
    cd ..
    ```

4.  **Compile the Extension:**
    ```bash
    npm run compile
    ```

5.  **Launch Graphide:**
    Start the IDE in development mode:
    ```bash
    ./scripts/code.sh
    ```

---

## 4. Verification

1.  **Access the Backend:**
    Open `http://127.0.0.1:8000/docs` in your browser. You should see the Swagger UI.

2.  **Check Neo4j:**
    Open `http://localhost:7474` (User: `neo4j`, Password: `graphide123`) to verify the graph database is running.

3.  **Run a Scan:**
    - In Graphide, open a vulnerable code file (e.g., `g.c`).
    - Click **"Run Analysis"** in the Graphide panel.
    - Once vulnerabilities are found, switch to the **Graph** tab and click **"Load Graph"**.
    - If nodes appear, the full system is working correctly.
