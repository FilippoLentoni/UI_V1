from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

import boto3
import pandas as pd
import streamlit as st

REGION = os.environ.get("AWS_REGION", "us-east-2")
STAGE = os.environ.get("APP_STAGE", "local")
DOCUMENT_BUCKET = os.environ.get("DOCUMENT_BUCKET", "")
PROMPT_BUCKET = os.environ.get("PROMPT_BUCKET", "")
EVENTS_TABLE = os.environ.get("EVENTS_TABLE", "")
PROCESSING_TABLE = os.environ.get("PROCESSING_TABLE", "")
MODEL_TABLE = os.environ.get("MODEL_TABLE", "")
MODEL_ID = os.environ.get("MODEL_ID", "us.amazon.nova-2-lite-v1:0")

s3_client = boto3.client("s3", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def username() -> str:
    return st.session_state.get("username") or "demo-user"


def table(name: str):
    if not name:
        return None
    return dynamodb.Table(name)


def put_event(session_id: str, event_type: str, payload: dict[str, Any]) -> None:
    events = table(EVENTS_TABLE)
    if events is None:
        return
    events.put_item(
        Item={
            "session_id": session_id,
            "timestamp": now_iso(),
            "event_type": event_type,
            "user": username(),
            "payload": payload,
        },
    )


def load_prompt() -> str:
    if not PROMPT_BUCKET:
        return "Summarize the document in concise bullet points."
    try:
        response = s3_client.get_object(Bucket=PROMPT_BUCKET, Key="prompts/default.json")
        data = json.loads(response["Body"].read().decode("utf-8"))
        return str(data.get("prompt", "Summarize the document in concise bullet points."))
    except Exception:
        return "Summarize the document in concise bullet points."


def save_prompt(prompt: str) -> None:
    if not PROMPT_BUCKET:
        return
    s3_client.put_object(
        Bucket=PROMPT_BUCKET,
        Key="prompts/default.json",
        Body=json.dumps({"prompt": prompt, "updated_at": now_iso(), "updated_by": username()}, indent=2),
        ContentType="application/json",
    )


def invoke_model(prompt: str) -> str:
    response = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 600, "temperature": 0.1},
    )
    return "".join(
        block.get("text", "")
        for block in response.get("output", {}).get("message", {}).get("content", [])
    ).strip()


def upload_document(file_name: str, content: bytes, session_id: str) -> str:
    if not DOCUMENT_BUCKET:
        raise RuntimeError("DOCUMENT_BUCKET is not configured")
    key = f"user_uploads/{username()}/{session_id}/{file_name}"
    s3_client.upload_fileobj(BytesIO(content), DOCUMENT_BUCKET, key)
    return f"s3://{DOCUMENT_BUCKET}/{key}"


def record_processing(session_id: str, source_uri: str, output: str) -> None:
    processing = table(PROCESSING_TABLE)
    if processing is None:
        return
    processing.put_item(
        Item={
            "session_id": session_id,
            "timestamp": now_iso(),
            "user": username(),
            "processing_status": "Succeeded",
            "processing_trigger_type": "document-summary",
            "source_s3_uri": source_uri,
            "output_text": output,
            "application_name": "document-arena",
            "dataset_version": "synthetic-smoke",
            "workflow_version": "public-v1",
        },
    )


def list_sessions() -> list[dict[str, Any]]:
    processing = table(PROCESSING_TABLE)
    if processing is None:
        return []
    response = processing.scan(Limit=100)
    return sorted(response.get("Items", []), key=lambda item: item.get("timestamp", ""), reverse=True)


st.set_page_config(page_title="Document Arena", layout="wide")

st.sidebar.title("Document Arena")
st.sidebar.caption(f"Stage: {STAGE}")
st.session_state["username"] = st.sidebar.text_input("User", value=username())
page = st.sidebar.radio("View", ["Process", "Prompt", "Leaderboard", "Health"])

if page == "Process":
    st.title("Document Processing")
    st.caption("Upload a small text document, store it in S3, and optionally summarize it with Bedrock.")
    uploaded = st.file_uploader("Document", type=["txt", "md", "csv", "json"])
    prompt = st.text_area("Prompt", value=load_prompt(), height=160)
    run_model = st.checkbox("Run Bedrock summary", value=False)

    if st.button("Upload and Process", disabled=uploaded is None):
        session_id = f"{username()}-{uuid.uuid4().hex[:8]}"
        content = uploaded.getvalue()
        source_uri = upload_document(uploaded.name, content, session_id)
        input_text = content.decode("utf-8", errors="replace")[:12000]
        output = "Uploaded successfully. Enable Bedrock summary to generate a model response."
        if run_model:
            output = invoke_model(f"{prompt}\n\nDocument:\n{input_text}")
        record_processing(session_id, source_uri, output)
        put_event(session_id, "document_processed", {"source_s3_uri": source_uri, "ran_model": run_model})
        st.success("Processing complete")
        st.code(source_uri)
        st.write(output)

elif page == "Prompt":
    st.title("Prompt Management")
    prompt = st.text_area("Default prompt", value=load_prompt(), height=220)
    if st.button("Save Prompt"):
        save_prompt(prompt)
        st.success("Prompt saved")

elif page == "Leaderboard":
    st.title("Processing Leaderboard")
    sessions = list_sessions()
    if not sessions:
        st.info("No sessions yet. Process a small document to populate this table.")
    else:
        rows = [
            {
                "session_id": item.get("session_id"),
                "user": item.get("user"),
                "status": item.get("processing_status"),
                "timestamp": item.get("timestamp"),
                "workflow": item.get("workflow_version"),
            }
            for item in sessions
        ]
        st.dataframe(pd.DataFrame(rows), use_container_width=True)

else:
    st.title("Health")
    st.json(
        {
            "status": "ok",
            "stage": STAGE,
            "region": REGION,
            "document_bucket_configured": bool(DOCUMENT_BUCKET),
            "prompt_bucket_configured": bool(PROMPT_BUCKET),
            "processing_table_configured": bool(PROCESSING_TABLE),
            "model_id": MODEL_ID,
        },
    )
