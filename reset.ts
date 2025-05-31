import { db } from "./vec.ts"
import { CONFIG } from "./config.js"

for (const name of Object.keys(CONFIG.collections)) {
    await db.deleteCollection({
        name: name,
    })
}
