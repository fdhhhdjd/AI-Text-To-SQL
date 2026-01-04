from sqlalchemy import create_engine, text
from config import DB_URI, logger

# Create SQLAlchemy engine with auto reconnect
engine = create_engine(DB_URI, pool_pre_ping=True)

def get_table_schema() -> str:
    """
    Fetch database schema from information_schema.
    Returns a formatted string describing all tables and columns.
    """
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

        return "\n".join(
            [
                f"Table {table}:\n" +
                "\n".join([f"  - {column}" for column in columns])
                for table, columns in schema_dict.items()
            ]
        )
    except Exception as e:
        logger.error(f"Schema Error: {e}")
        return ""
