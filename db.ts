import { ChromaClient, Collection } from "chromadb"
import { emb } from "./emb.js"
import { fs_status } from "./fs_api.js"
import { CONFIG } from "./config.js"

export const db = new ChromaClient()

export const COLLECTIONS: Record<string, Collection> = {}

for (const [name, path] of Object.entries(CONFIG.collections)) {
    COLLECTIONS[name] = await db.getOrCreateCollection({
        name: name,
    })
}

export async function upsert_vec({
    collection_id,
    id,
    content,
}: {
    collection_id: string
    id: string
    content: string
}) {
    const collection = COLLECTIONS[collection_id]

    const status = await fs_status({
        collection_id: collection_id,
        id: id,
    })

    const { embedding } = await emb.embed(content)
    // console.info({ emb_dims: embedding.length })

    await collection.upsert({
        ids: [id],
        embeddings: [embedding],
        metadatas: status
            ? [
                  {
                      atime: status.atime.getTime(),
                      mtime: status.mtime.getTime(),
                      ctime: status.ctime.getTime(),
                      birthtime: status.birthtime.getTime(),
                  },
              ]
            : undefined,
    })
}
