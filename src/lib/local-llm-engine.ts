import { CreateMLCEngine, MLCEngine, MLCEngineConfig, InitProgressReport, AppConfig } from "@mlc-ai/web-llm";

export type LocalModel = "phi-2-q4f16_1-MLC" | "Phi-3.5-mini-instruct-q4f16_1-MLC";

const appConfig: AppConfig = {
  model_list: [
    {
      model: "https://huggingface.co/mlc-ai/phi-2-q4f16_1-MLC",
      model_id: "phi-2-q4f16_1-MLC",
      model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/phi-2-q4f16_1-ctx2k_cs1k-webgpu.wasm",
      overrides: {
        context_window_size: 2048,
      },
    },
    {
      model: "https://huggingface.co/mlc-ai/Phi-3.5-mini-instruct-q4f16_1-MLC",
      model_id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
      model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
      overrides: {
        context_window_size: 4096,
      },
    },
  ],
};

export class LocalLLMEngine {
  private engine: MLCEngine | null = null;
  private currentModel: LocalModel | null = null;
  private onProgress: (report: InitProgressReport) => void;

  constructor(onProgress: (report: InitProgressReport) => void) {
    this.onProgress = onProgress;
  }

  async loadModel(model: LocalModel) {
    if (this.engine && this.currentModel === model) {
      return;
    }

    const config: MLCEngineConfig = {
      appConfig,
      initProgressCallback: this.onProgress,
    };

    this.engine = await CreateMLCEngine(model, config);
    this.currentModel = model;
  }

  async generate(prompt: string, messages: any[] = []) {
    if (!this.engine) {
      throw new Error("Engine not initialized");
    }

    const chatMessages = [
      ...messages,
      { role: "user", content: prompt }
    ];

    const reply = await this.engine.chat.completions.create({
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 256,
    });

    return reply.choices[0].message.content || "";
  }

  async generateStream(prompt: string, messages: any[], onChunk: (text: string) => void) {
      if (!this.engine) {
          throw new Error("Engine not initialized");
      }

      const chatMessages = [
          ...messages,
          { role: "user", content: prompt }
      ];

      const chunks = await this.engine.chat.completions.create({
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 512,
          stream: true,
      });

      let fullText = "";
      for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content || "";
          fullText += content;
          onChunk(fullText);
      }
      return fullText;
  }
}