# ── Stage 1: Frontend Builder ──
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: Runtime Runner ──
FROM python:3.11-slim
WORKDIR /app

# Install system compilers and runtimes
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    default-jdk \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy python backend requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Copy backend code
COPY server/ ./server/

# Expose port
EXPOSE 8000

# Start unified server
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
