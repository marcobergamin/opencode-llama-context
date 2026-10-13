# opencode-llama-context

An [OpenCode](https://opencode.ai) plugin that dynamically queries [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`) to auto-detect and synchronize runtime model capabilities and limits.

---

## 🎯 Why this plugin?

By default, OpenCode communicates with local LLMs using `@ai-sdk/openai-compatible`. Because the OpenAI `/v1/models` specification does not define a standard context window field, OpenCode requires a static `limit.context` in `opencode.jsonc`.

If you dynamically adjust your `llama-server` settings (e.g., toggling between single-GPU and multi-GPU, changing KV cache quantization, or adjusting context size between 64K, 120K, and 256K), OpenCode's static context limit may fall out of sync:
- **If OpenCode context > llama-server context:** Requests exceeding the server limit cause `context_length_exceeded` errors or context rolling.
- **If OpenCode context < llama-server context:** OpenCode unnecessarily prunes messages early, wasting available GPU memory.

`opencode-llama-context` solves this by querying `llama-server`'s native `/props` and `/v1/models` endpoints at startup to configure exact runtime limits on the fly.

---

## 🚀 Features

- **Dynamic Context Window:** Synchronizes `limit.context` with `default_generation_settings.n_ctx` / `meta.n_ctx` (e.g., `120064`, `262144`).
- **Multimodal Vision Detection:** Automatically sets `modalities.input: ["text", "image"]` if a vision projector (`mmproj`) is loaded, or falls back to `["text"]` for text-only profiles.
- **Chat Template Capabilities:** Detects and aligns `tool_call` support and reasoning preservation (`<think>` blocks).
- **Graceful Fallback:** If `llama-server` is offline or unreachable during startup, the plugin leaves configured defaults untouched without crashing or blocking OpenCode.

---

## 📦 Installation & Usage

### Option A: Local File Plugin (Recommended for local dev)

1. Clone or place this repository on your machine:
   ```bash
   git clone https://github.com/marcobergamin/opencode-llama-context.git ~/.config/opencode/plugins/opencode-llama-context
   ```

2. Add the plugin to your `~/.config/opencode/opencode.jsonc`:
   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": [
       "file:///home/<user>/.config/opencode/plugins/opencode-llama-context/src/index.ts"
     ],
     "provider": {
       "llama": {
         "npm": "@ai-sdk/openai-compatible",
         "name": "llama.cpp",
         "options": {
           "baseURL": "http://127.0.0.1:8080/v1"
         },
         "models": {
           "qwen3.8": {
             "name": "Qwen 3.8",
             "id": "qwen3.8",
             "limit": {
               "context": 120000,
               "output": 32768
             }
           }
         }
       }
     }
   }
   ```

### Option B: Remote PC / Client Setup

If you connect to a remote `llama-server` from another machine:
1. Copy this plugin to the remote machine's `~/.config/opencode/plugins/`.
2. Configure `baseURL` with your server's IP address (e.g., `http://192.168.1.10:8080/v1`).
3. The plugin will fetch `/props` directly from your server over the network and automatically synchronize the context limit on your remote client!

---

## 🛠️ How it Works

When OpenCode initializes, the plugin hooks into the `config` lifecycle:
1. Inspects providers named `llama` or `llama.cpp` using `@ai-sdk/openai-compatible`.
2. Concurrently queries `/props` and `/v1/models` from the configured `baseURL`.
3. Reads runtime metadata:
   - `n_ctx` -> Updates `model.limit.context`
   - `capabilities: ["multimodal"]` -> Updates `model.modalities.input`
   - `chat_template_caps.supports_tools` -> Updates `model.tool_call`
   - `chat_template_caps.supports_preserve_reasoning` -> Updates `model.reasoning`
4. Injects these values into OpenCode's in-memory model catalog.

---

## 📄 License

[MIT](LICENSE) © 2026 Marco Bergamin
