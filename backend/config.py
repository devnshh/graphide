"""Backend configuration loaded from environment variables."""

from dataclasses import dataclass
import os

def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    APP_NAME: str = "Graphide Backend"
    DEBUG: bool = True

    MODEL_Q_URL: str = _env_str("MODEL_Q_URL", "")
    MODEL_D_URL: str = _env_str("MODEL_D_URL", "")
    GEMINI_API_KEY: str = _env_str("GEMINI_API_KEY", "")

    JOERN_PORT: int = _env_int("JOERN_PORT", 8080)
    JOERN_HOST: str = _env_str("JOERN_HOST", "localhost")
    JOERN_COMPOSE_FILE: str = _env_str("JOERN_COMPOSE_FILE", "docker-compose.yml")

    JOERN_CONTAINER_PATH: str = "/data/exchange"
    JOERN_HOST_PATH: str = "/tmp/graphide_exchange"

    DEFAULT_ENDPOINT_ID: str = "predefined-openai-gpt4o"

    NEO4J_URI: str = _env_str("NEO4J_URI", "bolt://localhost:7687")
    NEO4J_USER: str = _env_str("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = _env_str("NEO4J_PASSWORD", "graphide123")

settings = Settings()
