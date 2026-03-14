"""Export LangGraph workflow diagrams as PNG images."""

import sys
import os

# Load .env before anything else
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Add parent directory so `backend.` imports resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.workflows.ingestion_graph import build_ingestion_graph
from backend.services.workflows.search_graph import search_graph


def export():
    # 1. Ingestion Graph
    ingestion = build_ingestion_graph()
    png_bytes = ingestion.get_graph().draw_mermaid_png()
    with open("ingestion_graph.png", "wb") as f:
        f.write(png_bytes)
    print("Saved: ingestion_graph.png")

    # 2. Search Graph
    png_bytes = search_graph.get_graph().draw_mermaid_png()
    with open("search_graph.png", "wb") as f:
        f.write(png_bytes)
    print("Saved: search_graph.png")


if __name__ == "__main__":
    export()
