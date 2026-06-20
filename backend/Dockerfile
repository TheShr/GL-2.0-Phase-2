FROM python:3.10-slim

WORKDIR /app

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy python packages list and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy pipeline orchestration scripts and codebase
COPY run_pipeline.sh ./
COPY src/ ./src/
COPY dataset/ ./dataset/
COPY .env* ./

# Ensure output directory exists and scripts are executable
RUN mkdir -p output && chmod +x run_pipeline.sh

# Mountable volume for telemetry/schedule exchange
VOLUME /app/output

# Start FastAPI server on container start
CMD ["python", "src/server.py"]
