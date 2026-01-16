import os
import json
from typing import Any, Dict

def read_file_content(file_path: str) -> str:
    """Read content of a file safely."""
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        with open(file_path, 'r') as f:
            return f.read()
    except Exception as e:
        raise Exception(f"Error reading file {file_path}: {str(e)}")

def parse_json_safely(json_str: str) -> Dict[str, Any]:
    """Parse JSON string safely, handling markdown code blocks."""
    try:
        # Remove markdown code blocks if present
        cleaned = json_str.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return json.loads(cleaned.strip())
    except json.JSONDecodeError as e:
        # Fallback: try to find first { and last }
        try:
            start = json_str.find('{')
            end = json_str.rfind('}')
            if start != -1 and end != -1:
                return json.loads(json_str[start:end+1])
        except:
            pass
        raise Exception(f"Failed to parse JSON: {json_str[:100]}... Error: {str(e)}")
