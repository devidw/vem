import { spawn } from "node:child_process"

export const db = spawn("bash", ["db.sh"], {
    stdio: "inherit",
})

process.on("SIGTERM", () => {
    db.kill()
    process.exit(0)
})

process.on("SIGINT", () => {
    db.kill()
    process.exit(0)
})

/**
 *
 */
;(async () => {
    const reindex = await import("./reindex.ts")

    await reindex.reindex_all()

    reindex.watch_all()
})()
