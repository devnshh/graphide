import os
import json
from typing import Any


def _strip_code_fences(text: str) -> str:
    """Remove a single fenced markdown wrapper if one is present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.lstrip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()

def read_file_content(file_path: str) -> str:
    """Read content of a file safely."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

def parse_json_safely(json_str: str) -> Any:
    """Parse JSON text safely, handling fences and wrapper text."""
    cleaned = _strip_code_fences(json_str)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as error:
        for open_char, close_char in (("{", "}"), ("[", "]")):
            start = cleaned.find(open_char)
            end = cleaned.rfind(close_char)
            if start != -1 and end != -1 and end > start:
                candidate = cleaned[start : end + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue

        raise Exception(f"Failed to parse JSON: {json_str[:100]}... Error: {str(error)}")
