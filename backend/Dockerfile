# Use official Python 3.11 slim image (lightweight)
FROM python:3.11-slim

# Set working directory inside container
WORKDIR /app

# Prevent Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1

# Ensure logs are flushed immediately
ENV PYTHONUNBUFFERED=1

# Copy dependency list first (better Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire application source code
COPY app ./app

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI application using Uvicorn
# main:app → app/main.py contains FastAPI instance named "app"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
