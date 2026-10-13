import type { Plugin, PluginInput } from "@opencode-ai/plugin";

/**
 * OpenCode Dynamic llama-server Metadata Sync Plugin
 *
 * Automatically syncs runtime metadata from llama.cpp (llama-server) into OpenCode:
 * - Real runtime context window size (n_ctx)
 * - Multimodal vision capabilities (image input support)
 * - Chat template capabilities (tool calling, reasoning preservation)
 */
export const LlamaContextPlugin: Plugin = async (input: PluginInput) => {
  return {
    async config(config: any) {
      if (!config || !config.provider) return;

      // Identify candidate llama providers (e.g. 'llama', 'llama.cpp', or any provider with matching name)
      const providerKeys = Object.keys(config.provider).filter((key) => {
        const p = config.provider[key];
        const name = (p.name || key).toLowerCase();
        return (
          name.includes("llama") ||
          key === "llama" ||
          key === "llama.cpp" ||
          key === "llamacpp"
        );
      });

      if (providerKeys.length === 0) return;

      for (const key of providerKeys) {
        const provider = config.provider[key];
        if (!provider || !provider.models) continue;

        const rawURL = provider.options?.baseURL || "http://127.0.0.1:8080/v1";
        const baseURL = rawURL.replace(/\/+$/, "");
        const hostURL = baseURL.replace(/\/v1$/, "");

        try {
          // Fetch /props and /v1/models concurrently with a short timeout
          const [propsRes, modelsRes] = await Promise.all([
            fetch(`${hostURL}/props`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(2000),
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            fetch(`${baseURL}/models`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(2000),
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ]);

          if (!propsRes && !modelsRes) {
            // llama-server is currently offline or unreachable; leave configured defaults intact
            continue;
          }

          // 1. Detect dynamic context window size (n_ctx)
          const realCtx: number | undefined =
            propsRes?.default_generation_settings?.n_ctx ||
            modelsRes?.data?.[0]?.meta?.n_ctx;

          // 2. Detect multimodal vision capabilities
          const isMultimodal: boolean =
            modelsRes?.models?.[0]?.capabilities?.includes("multimodal") ?? true;

          // 3. Detect chat template capabilities
          const caps = propsRes?.chat_template_caps || {};
          const supportsTools = caps.supports_tools ?? true;
          const supportsReasoning = caps.supports_preserve_reasoning ?? true;

          // Update all registered models for this provider
          for (const modelId of Object.keys(provider.models)) {
            const model = provider.models[modelId];
            if (!model) continue;

            // Sync context window
            if (realCtx && typeof realCtx === "number") {
              if (!model.limit) {
                model.limit = { context: realCtx, output: 32768 };
              } else {
                model.limit.context = realCtx;
              }
            }

            // Sync vision modalities
            if (model.modalities) {
              model.modalities.input = isMultimodal
                ? ["text", "image"]
                : ["text"];
            }

            // Sync tool calling and reasoning flags if exposed by server template
            if (caps.supports_tools !== undefined) {
              model.tool_call = supportsTools;
            }
            if (caps.supports_preserve_reasoning !== undefined) {
              model.reasoning = supportsReasoning;
            }
          }
        } catch {
          // Gracefully continue without throwing on network or parsing errors
        }
      }
    },
  };
};

export default LlamaContextPlugin;
