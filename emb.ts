import { LMStudioClient } from "@lmstudio/sdk";

const lm = new LMStudioClient({});

export const emb = await lm.embedding.model(
    "text-embedding-nomic-embed-text-v1.5-embedding",
);
