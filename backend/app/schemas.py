from pydantic import BaseModel

class QueryRequest(BaseModel):
    """
    Request body for SQL generation endpoint
    """
    question: str
