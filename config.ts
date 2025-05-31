import { z } from "zod"
import fs from "node:fs"

const config_schema = z.object({
    collections: z.record(z.string(), z.string()).default({}),
})

const config_raw = fs
    .readFileSync(process.argv[2] || "./config.json")
    .toString()
const config_json = JSON.parse(config_raw)

export const CONFIG = config_schema.parse(config_json)

// console.info(JSON.stringify(CONFIG, null, 4))
