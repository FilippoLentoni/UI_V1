FROM public.ecr.aws/docker/library/python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV STREAMLIT_SERVER_PORT=8501
ENV STREAMLIT_SERVER_ADDRESS=0.0.0.0

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY document_arena/ ./document_arena/

EXPOSE 8501

CMD ["streamlit", "run", "document_arena/Home.py", "--server.headless=true", "--server.enableCORS=false", "--browser.gatherUsageStats=false"]
