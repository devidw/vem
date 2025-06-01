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
    keyword_match,
}: {
    query: string
    collection_id: string
    n?: number
    where?: Where
    keyword_match?: boolean
}) {
    const { embedding } = await emb.embed(query)

    const vec_collection = COLLECTIONS[collection_id]

    const out = await vec_collection.query({
        queryEmbeddings: [embedding],
        nResults: n ?? 5,
        where: where,
        whereDocument: keyword_match
            ? {
                  $contains: query,
              }
            : undefined,
        include: [
            IncludeEnum.Distances,
            IncludeEnum.Metadatas,
            IncludeEnum.Documents,
        ],
    })

    // console.info(JSON.stringify(out, null, 4))

    if (!out.distances) {
        console.warn("got no distances for sim search")
        return []
    }

    const results: (Doc & {
        path: string
        distance: number
    })[] = []

    for (const [i, id] of out.ids[0].entries()) {
        const meta_data = out.metadatas[0][i]
        const content = out.documents[0][i]

        if (!meta_data || typeof meta_data["file"] !== "string" || !content) {
            continue
        }

        const file_id = meta_data["file"]

        const doc = await fs_get({
            collection_id: collection_id,
            id: file_id,
        })

        if (!doc) {
            await vec_collection.delete({ ids: [id] })
            console.info(`skip orphan ${collection_id} ${id}`)
            continue
        }

        results.push({
            ...doc,
            content: content,
            distance: out.distances![0][i],
            path: CONFIG.collections[collection_id] + "/" + doc.id,
        })
    }

    return results
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
export async function meta_query({
    input,
    keyword_match,
}: {
    input: string
    keyword_match?: boolean
}) {
    const docs = await Promise.all(
        Object.keys(CONFIG.collections).map((collection_id) =>
            query({
                query: input,
                collection_id: collection_id,
                n: COUNT,
                keyword_match,
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
            // Sort by distance (ascending)
            return a.distance - b.distance
        })

    return outs
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const out = await meta_query({
        input: process.argv[3],
        keyword_match: process.argv[4] === "1",
    })
    console.info(JSON.stringify(out, null, 4))
}
