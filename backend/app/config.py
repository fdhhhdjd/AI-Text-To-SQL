import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Database connection string
DB_URI = os.getenv("DB_URI")

# Gemini API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Global variable to store a valid Gemini model ID
VALID_MODEL_ID = None

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

# Application logger
logger = logging.getLogger("sql-assistant")
