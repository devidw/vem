import { CONFIG } from "./config.js"
import { COLLECTIONS } from "./db.js"
import { emb } from "./emb.js"
import { fs_get } from "./fs_api.js"
import type { Where } from "chromadb"

const MIN_CLOSENESS = 1
const COUNT = 5

export async function query({
    query,
    collection_id,
    n,
    where,
}: {
    query: string
    collection_id: string
    n?: number
    where?: Where
}) {
    const { embedding } = await emb.embed(query)

    const vec_collection = COLLECTIONS[collection_id]

    const out = await vec_collection.query({
        queryEmbeddings: [embedding],
        nResults: n ?? 5,
        where: where,
    })

    if (!out.distances) {
        console.warn("got no distances for sim search")
        return []
    }

    const all = await Promise.all(
        out.ids[0].map((id) => fs_get({ collection_id, id })),
    )
    const items = all.filter(Boolean) as any[]

    const merged: {
        distance: number
        path: string
        item: {
            id: string
            content: string
            collection_id: string
        }
    }[] = []

    for (const [i, id] of out.ids[0].entries()) {
        const item = items.find((one) => one.id === id)

        if (!item) {
            await vec_collection.delete({ ids: [id] })
            console.info(`del orphan ${collection_id} ${id}`)
            continue
        }

        merged.push({
            distance: out.distances![0][i],
            path: CONFIG.collections[collection_id] + "/" + item.id,
            item,
        })
    }

    return merged
}

/**


 * this is the place to build in some better algo to prio by recency & frequency etc
 *
 * def want to have min sim
 * also account for recency (ctime)
 *
 * lets pull in more than we want to pick into the prompt
 * compute ranks and then only take the top_x
 */
export async function meta_query({ input }: { input: string }) {
    const docs = await Promise.all(
        Object.keys(CONFIG.collections).map((collection_id) =>
            query({
                query: input,
                collection_id: collection_id,
                n: COUNT,
            }),
        ),
    )

    const outs = docs
        .flat()
        .filter((mem) => {
            if (mem.distance > MIN_CLOSENESS) {
                return false
            }

            if (mem.item.content.trim().length === 0) {
                return false
            }

            return true
        })
        .sort((a, b) => a.distance - b.distance)

    return outs.slice(0, COUNT)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const out = await meta_query({
        input: process.argv[3],
    })
    console.info(JSON.stringify(out, null, 4))
}
