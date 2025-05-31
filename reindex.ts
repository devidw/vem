/**
 * somewwhere we have to store the last index time
 * then we find all files in the collection dir that have been created or updated after that
 * and we just re-embed them for now
 * this can be improved by per file basis timestamps going forward
 */

import fs from "node:fs/promises"
import { CONFIG } from "./config.js"
import path from "node:path"
import { fs_get } from "./fs_api.js"
import { COLLECTIONS, upsert_vec } from "./vec.js"

async function reindex_collection({
    collection_id,
    force = false,
}: {
    collection_id: string
    force?: boolean
}) {
    const dir = CONFIG.collections[collection_id]

    let last_index: Date | null = null

    if (!force) {
        try {
            const contents = (await fs.readFile(dir + "/_state.txt")).toString()
            last_index = new Date(contents)
        } catch {}
    }

    console.info({ collection_id, last_index, force })

    const entries = await fs.readdir(dir, {
        recursive: true,
        withFileTypes: true,
    })

    const ids = entries
        .filter((f) => f.isFile() && f.name.endsWith(".md"))
        .map((a) => {
            const id = path.basename(a.name)
            const full_path = `${a.parentPath}/${id}`.replace(dir + "/", "")
            return full_path
        })

    const ids_to_index: string[] = force ? ids : []

    if (!force) {
        for (const id of ids) {
            const stats = await fs.stat(path.join(dir, id))
            if (!last_index || stats.ctime > last_index) {
                ids_to_index.push(id)
            }
        }
    }

    console.info({ collection_id, reindex_todo: ids_to_index.length })

    if (ids_to_index.length === 0) {
        return
    }

    // await Promise.all(
    //     ids_to_index.map(async (id) => {
    //         return upsert_vec({
    //             collection_id,
    //             id,
    //         })
    //     }),
    // )

    for (const id of ids_to_index) {
        await upsert_vec({
            collection_id,
            id,
        })
    }

    await fs.writeFile(dir + "/_state.txt", new Date().toISOString())
}

/**
 * for rename on macos i get "rename" but neither the new name nor an event for the new file
 * thus we just force reindex on "rename"
 */
async function collection_watch({ collection_id }: { collection_id: string }) {
    console.info(`${collection_id} watch start`)

    const collection = COLLECTIONS[collection_id]

    const watcher = fs.watch(CONFIG.collections[collection_id], {
        recursive: true,
    })

    for await (const event of watcher) {
        if (!event.filename?.endsWith(".md")) {
            continue
        }

        const id = event.filename

        console.info(`doc ${id} ${event.eventType}`)

        switch (event.eventType) {
            case "change": {
                await upsert_vec({ collection_id, id })
                break
            }
            case "rename": {
                await collection.delete({
                    where: {
                        file: id,
                    },
                }) // id is the prev filename, now out of date
                await reindex_collection({ collection_id })
                break
            }
        }
    }
}

export async function reindex_all(force = false) {
    for (const id of Object.keys(CONFIG.collections)) {
        await reindex_collection({ collection_id: id, force })
    }
}

export function watch_all() {
    for (const id of Object.keys(CONFIG.collections)) {
        collection_watch({ collection_id: id })
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await reindex_all(true)
}
