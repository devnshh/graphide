import os
import logging



class Settings:
    # Application settings
    APP_NAME: str = "Graphide Backend"
    DEBUG: bool = True
    
    # OnDemand API
    ONDEMAND_API_KEY: str = os.getenv("ONDEMAND_API_KEY", "rovg7LltIcxMXXk1AUKSaVEDxpgF77Tl")
    ONDEMAND_API_URL: str = os.getenv("ONDEMAND_API_URL", "https://api.on-demand.io/chat/v1/sessions")
    
    # Joern
    JOERN_PORT: int = int(os.getenv("JOERN_PORT", "8080"))
    JOERN_HOST: str = os.getenv("JOERN_HOST", "localhost")
    JOERN_COMPOSE_FILE: str = os.getenv("JOERN_COMPOSE_FILE", "docker-compose.yml")
    
    # Session
    DEFAULT_ENDPOINT_ID: str = "predefined-openai-gpt4o"

settings = Settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("graphide")
