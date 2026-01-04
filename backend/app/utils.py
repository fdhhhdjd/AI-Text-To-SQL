import re

def clean_sql(sql: str) -> str:
    """
    Remove markdown code blocks and normalize SQL.
    Ensure the query ends with a semicolon.
    """
    sql = re.sub(
        r"```(?:sql)?\s*(.*?)\s*```",
        r"\1",
        sql,
        flags=re.DOTALL | re.IGNORECASE
    )
    sql = sql.replace("\n", " ").strip()
    return sql if sql.endswith(";") else sql + ";"
