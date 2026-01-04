import time
from fastapi import APIRouter
from sqlalchemy import text

from config import VALID_MODEL_ID, logger
from database import engine, get_table_schema
from ai import generate_sql
from utils import clean_sql
from schemas import QueryRequest

router = APIRouter()

@router.post("/api/query")
async def query_sql(req: QueryRequest):
    """
    Convert natural language question into SQL,
    execute it, and return the result.
    """
    start_ts = time.time()

    if not VALID_MODEL_ID:
        return {
            "success": False,
            "error": "AI Model not available. Check startup logs."
        }

    try:
        schema = get_table_schema()
        raw_sql = generate_sql(req.question, schema)
        sql = clean_sql(raw_sql)

        if not sql.upper().startswith("SELECT"):
            return {
                "success": False,
                "error": f"Invalid SQL generated: {sql}"
            }

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
        logger.error(f"Query Error: {e}")
        return {"success": False, "error": str(e)}

@router.get("/api/health")
async def health_check():
    """
    Health check endpoint for frontend monitoring
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    return {
        "status": "online",
        "database": {
            "connected": db_connected,
            "schema_available": bool(get_table_schema())
        },
        "ai_model": VALID_MODEL_ID or "unavailable",
        "timestamp": time.time()
    }

@router.get("/api/schema")
async def get_schema():
    """
    Return full database schema
    """
    schema = get_table_schema()
    return {
        "schema": schema,
        "tables": schema.count("Table") if schema else 0
    }
