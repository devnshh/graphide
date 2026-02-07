
import os

class Settings:
    # Application settings
    APP_NAME: str = "Graphide Backend"
    DEBUG: bool = True
    
    # Model APIs
    MODEL_Q_URL: str = os.getenv("MODEL_Q_URL", "")
    MODEL_D_URL: str = os.getenv("MODEL_D_URL", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Joern
    JOERN_PORT: int = int(os.getenv("JOERN_PORT", "8080"))
    JOERN_HOST: str = os.getenv("JOERN_HOST", "localhost")
    JOERN_COMPOSE_FILE: str = os.getenv("JOERN_COMPOSE_FILE", "docker-compose.yml")
    
    # Path inside the container where code is mounted
    JOERN_CONTAINER_PATH: str = "/data/exchange"
    # Path on the host where code is written
    JOERN_HOST_PATH: str = "/tmp/graphide_exchange"
    
    # Session
    DEFAULT_ENDPOINT_ID: str = "predefined-openai-gpt4o"

settings = Settings()
