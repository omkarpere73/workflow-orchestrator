FROM python:3.12-slim
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine ./engine
COPY api ./api
COPY pipeline ./pipeline
COPY workflows ./workflows
