import { ChromaClient, Collection } from "chromadb"
import { emb } from "./emb.js"
import { fs_get, fs_status } from "./fs_api.js"
import { CONFIG } from "./config.js"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { randomUUID } from "node:crypto"

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown")

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
}: {
    collection_id: string
    id: string
}) {
    const doc = await fs_get({
        collection_id,
        id,
    })

    if (!doc) {
        return
    }

    const collection = COLLECTIONS[collection_id]

    const status = await fs_status({
        collection_id: collection_id,
        id: id,
    })

    if (!status) {
        console.error(`got no status for ${id}`)
        return
    }

    const meta = {
        file: id,
        atime: status.atime.getTime(),
        mtime: status.mtime.getTime(),
        ctime: status.ctime.getTime(),
        birthtime: status.birthtime.getTime(),
    }

    const docs = await splitter.splitText(doc.content)

    const embeddings = await Promise.all(
        docs.map(async (content) => {
            const { embedding } = await emb.embed(content)
            return embedding
        }),
    )

    await collection.delete({
        where: {
            file: id,
        },
    })

    try {
        await collection.upsert({
            ids: docs.map((_) => randomUUID()),
            embeddings: embeddings,
            metadatas: docs.map((_) => meta),
        })
    } catch (e) {
        console.error(e)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const doc = await fs_get({
        collection_id: "diary",
        id: "25-05-31.md",
    })

    const out = await splitter.createDocuments([doc!.content])
    console.info(JSON.stringify(out, null, 4))
}
