FROM python:3.11-slim-bookworm
WORKDIR /app
RUN pip install --no-cache-dir piper-tts==1.8.0
COPY server.py ./
ENV PYTHONUNBUFFERED=1
EXPOSE 5001
CMD ["python", "server.py"]
