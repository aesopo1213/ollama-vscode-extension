export interface Model {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: any;
  supportsTools?: boolean; // Indicates if the model supports tool calling
}

export interface CompletionOptions {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  options?: Record<string, any>;
}

export interface CompletionResponse {
  model: string;
  created_at: string;
  response: string;
  context?: number[];
  done: boolean;
}

// Interface for a tool definition
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: {
      type: 'object';
      properties?: Record<string, ParameterSchema>;
      required?: string[];
    };
  };
}

// Interface for a tool call
export interface ToolCall {
  id: string | number;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

// Interface for function parameter schema
export interface ParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
}

// Interface for a single chat message
export interface ChatMessage {
  id: string | number;
  role?: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_call_id?: string | number;
}

// Interface for the Ollama /api/chat request body
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  format?: 'json';
  options?: Record<string, any>;
  keep_alive?: string | number;
  tools?: Tool[];
}

// Interface for the Ollama /api/chat response (non-streaming, stream: false)
export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  done_reason?: 'stop' | 'length';
}