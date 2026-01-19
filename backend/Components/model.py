import json
from enum import Enum
from typing import List, Dict, Tuple, Any, Optional, Union
import requests


class Model(Enum):
    """Enum of supported LLM types"""
    DEEPSEEK = 1
    VLLM = 2


class LLMManager:
    """
    Manages interactions with Language Models, including:
    - Sending prompts and processing responses
    - Handling different model types
    - Extracting structured data from responses
    """
    
    def __init__(self, model_type: Model, model_name: str, **kwargs):
        """
        Initialize the LLM client
        
        Args:
            model_type: The type of model from the Model enum
            model_name: The specific model name to use
            **kwargs: Additional parameters including:
                - api_key: API key for the service
                - temperature: Controls randomness (0-1)
                - top_p: Controls diversity via nucleus sampling
                - top_k: Controls diversity via vocabulary restriction
                - max_tokens: Maximum number of tokens to generate
                - n/num_generations: Number of completions to generate
                - port: Port for local vLLM server (default: 8081)
        """
        self.model_type = model_type
        self.model_name = model_name
        self.api_key = kwargs.get("api_key")
        self.history = []
        self.port = kwargs.get("port", 8081)
        
        # Store generation parameters
        self.kwargs = {
            "temperature": kwargs.get("temperature", 0.0),
            "top_p": kwargs.get("top_p", 0.95),
            "top_k": kwargs.get("top_k", 30),
            "max_tokens": kwargs.get("max_tokens", 8128),
            "n": kwargs.pop("n", kwargs.pop("num_generations", 1)),
        }
        
        # Add any remaining kwargs
        for key, value in kwargs.items():
            if key not in ["api_key", "port"]:
                self.kwargs[key] = value
        
        # Set up the base URL based on model type
        if model_type == Model.DEEPSEEK:
            self.url = "https://api.deepseek.com"
        else:
            # vLLM hosted models
            self.url = f"http://localhost:{self.port}/v1/chat/completions"

    def send_prompt(self, prompt: str) -> Dict[str, Any]:
        """
        Send a basic prompt to the language model
        
        Args:
            prompt: The text prompt to send
            
        Returns:
            The parsed response
        """
        messages = [{"role": "user", "content": prompt}]
        return self.send_messages(messages)
    
    def send_messages(self, message_history: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Send a sequence of messages to the language model
        
        Args:
            message_history: List of message dictionaries with 'role' and 'content'
            
        Returns:
            The parsed response
        """
        try:
            # Prepare payload based on model type
            payload = self._prepare_request_payload(message_history)
            
            # Remove None values from payload
            payload = {k: v for k, v in payload.items() if v is not None}
            
            # Handle different API clients
            if self.model_type == Model.DEEPSEEK:
                # Using OpenAI compatible client for DeepSeek
                try:
                    from openai import OpenAI
                    client = OpenAI(
                        api_key=self.api_key,
                        base_url=self.url
                    )
                    response = client.chat.completions.create(**payload)
                    response_data = json.loads(response.model_dump_json())
                except ImportError:
                    # Fall back to requests if OpenAI client not available
                    headers = {"Authorization": f"Bearer {self.api_key}"}
                    response = requests.post(self.url + "/v1/chat/completions", 
                                           json=payload, 
                                           headers=headers)
                    response_data = response.json()
            else:
                # For other APIs using requests
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                
                response = requests.post(self.url, json=payload, headers=headers)
                if not response.ok:
                    raise Exception(f"API request failed with status {response.status_code}: {response.text}")
                
                response_data = response.json()
            
            # Store in history for future use
            self.history.extend(message_history)
            if "choices" in response_data and response_data["choices"]:
                self.history.append(response_data["choices"][0]["message"])
            
            return response_data
            
        except Exception as e:
            # Better error handling
            if isinstance(e, requests.exceptions.ConnectionError):
                raise ConnectionError(f"Failed to connect to {self.url}. Is your server running?")
            elif isinstance(e, json.JSONDecodeError):
                raise ValueError(f"Invalid JSON response from API: {e}")
            else:
                raise e

    def _prepare_request_payload(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Prepare the request payload based on the model type
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            The formatted payload for the API request
        """
        
        # OpenAI-compatible format (works for DeepSeek, and vLLM)
        return {
            "model": self.model_name,
            "messages": messages,
            "temperature": self.kwargs.get("temperature"),
            "max_tokens": self.kwargs.get("max_tokens"),
            "top_p": self.kwargs.get("top_p"),
            "top_k": self.kwargs.get("top_k"),
            "n": self.kwargs.get("n"),
        }
    
    def get_completion_text(self, response_data: Dict[str, Any]) -> str:
        """
        Extract just the completion text from a response
        
        Args:
            response_data: The full API response
            
        Returns:
            Just the completion text
        """
        
        return response_data["choices"][0]["message"]["content"]
    
    def extract_queries(self, response_text: str) -> Dict[str, List[str]]:
        """
        Extract CPGQL queries from the model's response
        
        Args:
            response_text: The raw text response from the LLM
            
        Returns:
            Dictionary with extracted queries
        """
        try:
            # Try to find JSON code block
            start = response_text.rfind("```json")
            end = response_text.rfind("}```")
            
            if start == -1 or end == -1:
                # No valid JSON block found
                return {"queries": ['wrong query']}
            
            # Extract JSON content
            json_text = response_text[start+7:end+1]
            print("parsed response:\n ", json_text + "\n\n\n")
            
            # Try to parse directly as JSON first
            try:
                json_obj = json.loads(json_text)
                return json_obj
            except json.JSONDecodeError:
                # Fall back to manual parsing if JSON parsing fails
                queries = []
                done = False
                idx = 0
                
                while True:
                    start = json_text.find("'", idx)
                    end = json_text.find("', '", idx)
                    
                    if end == -1:
                        end = json_text.find("']\n}")
                        done = True
                    
                    if start == -1 or end == -1 or end < start:
                        break
                    
                    queries.append(json_text[start+1:end])
                    idx = end + 1
                    
                    if done:
                        break
                
                if not done:
                    return {"queries": ['wrong query, not done yet']}
                
                return {"queries": queries}
                
        except Exception as e:
            print("Exception in extract_queries:", e)
            return {"queries": ['wrong query']}
