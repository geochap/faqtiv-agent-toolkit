from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# pydantic request models
class Message(BaseModel):
    role: str
    name: Optional[str] = None
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    additional_kwargs: Optional[Dict[str, Any]] = None

class CompletionRequest(BaseModel):
    messages: List[Message]
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    stream: Optional[bool] = False
    include_tool_messages: Optional[bool] = False

class CompletionResponse(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[dict]