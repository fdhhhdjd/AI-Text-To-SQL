from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

from config import GEMINI_API_KEY, VALID_MODEL_ID, logger
from routes import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup:
    - Validate Gemini API key
    - Auto-detect available Gemini models
    """
    global VALID_MODEL_ID

    logger.info("🚀 Starting application and scanning Gemini models...")

    if not GEMINI_API_KEY:
        logger.error("❌ GEMINI_API_KEY is missing")
        yield
        return

    try:
        genai.configure(api_key=GEMINI_API_KEY)

        models = [
            m.name for m in genai.list_models()
            if "generateContent" in m.supported_generation_methods
        ]

        priority = [
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro",
            "models/gemini-pro"
        ]

        for p in priority:
            if p in models:
                VALID_MODEL_ID = p
                break

        if not VALID_MODEL_ID:
            gemini_models = [m for m in models if "gemini" in m]
            if gemini_models:
                VALID_MODEL_ID = gemini_models[0]

        if VALID_MODEL_ID:
            logger.info(f"✅ Using Gemini model: {VALID_MODEL_ID}")
        else:
            logger.error("❌ No available Gemini model found")

    except Exception as e:
        logger.error(f"Model scan error: {e}")

    yield

app = FastAPI(
    title="SQL Assistant Fixed",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
