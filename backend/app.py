import os
import re
import time
import logging
from typing import Optional, Any, Dict, List

from dotenv import load_dotenv
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import google.generativeai as genai
from sqlalchemy import create_engine, text

# =====================================================
# 1. CẤU HÌNH & LOGGING
# =====================================================
load_dotenv()

DB_URI = os.getenv("DB_URI")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("sql-assistant")

# Biến toàn cục để lưu model ID tìm được
VALID_MODEL_ID = None 

# =====================================================
# 2. DATABASE LOGIC
# =====================================================
engine = create_engine(DB_URI, pool_pre_ping=True)

def get_table_schema() -> str:
    query = """
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(query)).fetchall()
        schema_dict = {}
        for table, col, dtype in rows:
            schema_dict.setdefault(table, []).append(f"{col} ({dtype})")
        return "\n".join([f"Table {t}:\n" + "\n".join([f"  - {c}" for c in cols]) for t, cols in schema_dict.items()])
    except Exception as e:
        logger.error(f"Schema Error: {e}")
        return ""

# =====================================================
# 3. LIFESPAN - TỰ ĐỘNG DÒ MODEL (FIX 404)
# =====================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global VALID_MODEL_ID
    logger.info("🚀 Đang khởi động và kiểm tra Model...")
    
    if not GEMINI_API_KEY:
        logger.error("❌ Thiếu GEMINI_API_KEY")
        yield
        return

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Lấy danh sách các model mà API Key này được phép dùng
        models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        logger.info(f"🔍 Danh sách model khả dụng: {models}")

        # Ưu tiên tìm model theo thứ tự tốt nhất
        priority_list = ["models/gemini-1.5-flash", "models/gemini-1.5-pro", "models/gemini-pro"]
        # priority_list = ["models/gemini-2.5-flash-lite"]

        
        for p in priority_list:
            if p in models:
                VALID_MODEL_ID = p
                break
        
        # Nếu không thấy cái nào trong priority, lấy cái đầu tiên có chữ 'gemini'
        if not VALID_MODEL_ID:
            gemini_models = [m for m in models if "gemini" in m]
            if gemini_models:
                VALID_MODEL_ID = gemini_models[0]

        if VALID_MODEL_ID:
            logger.info(f"✅ Đã chọn được model hoạt động: {VALID_MODEL_ID}")
        else:
            logger.error("❌ Không tìm thấy bất kỳ model Gemini nào khả dụng!")

    except Exception as e:
        logger.error(f"❌ Lỗi khi quét model: {e}")

    yield

app = FastAPI(title="SQL Assistant Fixed", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# =====================================================
# 4. AI & EXECUTION
# =====================================================
def generate_sql(question: str, schema: str) -> str:
    if not VALID_MODEL_ID:
        return ""
    try:
        model = genai.GenerativeModel(model_name=VALID_MODEL_ID)
        prompt = f"""Bạn là chuyên gia PostgreSQL. Dựa vào schema bên dưới, hãy viết 1 câu SQL SELECT.
Chỉ trả về SQL, không giải thích, không markdown.

SCHEMA:
{schema}

CÂU HỎI: {question}
SQL:"""
        response = model.generate_content(prompt)
        return response.text.strip() if response.text else ""
    except Exception as e:
        logger.error(f"Lỗi AI: {e}")
        return ""

def clean_sql(sql: str) -> str:
    sql = re.sub(r"```(?:sql)?\s*(.*?)\s*```", r"\1", sql, flags=re.DOTALL | re.IGNORECASE)
    sql = sql.replace("\n", " ").strip()
    return sql if sql.endswith(";") else sql + ";"

# =====================================================
# 5. ENDPOINTS
# =====================================================
class QueryRequest(BaseModel):
    question: str

@app.post("/api/query")
async def query_sql(req: QueryRequest):
    start_ts = time.time()
    if not VALID_MODEL_ID:
        return {"success": False, "error": "AI Model không khả dụng. Kiểm tra log khởi động."}

    try:
        schema = get_table_schema()
        raw_sql = generate_sql(req.question, schema)
        sql = clean_sql(raw_sql)

        if not sql or not sql.upper().startswith("SELECT"):
            return {"success": False, "error": f"AI tạo SQL không hợp lệ: {sql}"}

        with engine.connect() as conn:
            result = conn.execute(text(sql))
            data = [dict(row) for row in result.mappings()]

        return {
            "question": req.question,
            "sql_query": sql,
            "result": data,
            "execution_time": round(time.time() - start_ts, 3),
            "success": True
        }
    except Exception as e:
        logger.error(f"Lỗi truy vấn: {e}")
        return {"success": False, "error": str(e)}

# =====================================================
# 6. HEALTH CHECK ENDPOINT
# =====================================================
@app.get("/api/health")
async def health_check():
    """Health check endpoint for frontend"""
    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        db_connected = False
    
    return {
        "status": "online",
        "database": {
            "connected": db_connected,
            "schema_available": bool(get_table_schema())
        },
        "ai_model": VALID_MODEL_ID if VALID_MODEL_ID else "unavailable",
        "timestamp": time.time()
    }

# Thêm cái này nếu muốn xem schema
@app.get("/api/schema")
async def get_schema():
    """Get database schema"""
    schema = get_table_schema()
    return {
        "schema": schema,
        "tables": schema.count("Table") if schema else 0
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)