import { CONFIG } from "./config.js"
import { COLLECTIONS } from "./vec.js"
import { emb } from "./emb.js"
import { fs_get } from "./fs_api.js"
import { IncludeEnum, type Where } from "chromadb"
import { Doc } from "./types.js"

const MIN_CLOSENESS = Number.POSITIVE_INFINITY
const COUNT = 10

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
        include: [IncludeEnum.Distances, IncludeEnum.Metadatas],
    })

    // console.info(JSON.stringify(out, null, 4))

    if (!out.distances) {
        console.warn("got no distances for sim search")
        return []
    }

    const all: (Doc & {
        path: string
        distance: number
        count: number
    })[] = []

    for (const [i, id] of out.ids[0].entries()) {
        const meta_data = out.metadatas[0][i]

        if (!meta_data || typeof meta_data["file"] !== "string") {
            continue
        }

        const file_id = meta_data["file"]

        const exisitng = all.find((a) => a.id === file_id)

        if (exisitng) {
            exisitng.count++
            continue
        }

        const doc = await fs_get({
            collection_id: collection_id,
            id: file_id,
        })

        if (!doc) {
            await vec_collection.delete({ ids: [id] })
            console.info(`skip orphan ${collection_id} ${id}`)
            continue
        }

        all.push({
            ...doc,
            distance: out.distances![0][i],
            path: CONFIG.collections[collection_id] + "/" + doc.id,
            count: 1,
        })
    }

    return all
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

            if (mem.content.trim().length === 0) {
                return false
            }

            return true
        })
        .sort((a, b) => {
            // First sort by count (descending)
            if (b.count !== a.count) {
                return b.count - a.count
            }
            // Then sort by distance (ascending)
            return a.distance - b.distance
        })

    return outs
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const out = await meta_query({
        input: process.argv[3],
    })
    console.info(JSON.stringify(out, null, 4))
}
