import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.js";
import { COLLECTIONS } from "./db.js";

export async function fs_get({
    collection_id,
    id,
}: {
    collection_id: string;
    id: string;
}) {
    try {
        const file_path = path.join(CONFIG.collections[collection_id], id);
        const content = await fs.readFile(file_path, "utf-8");

        return {
            id,
            content,
            collection_id,
        };
    } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
            const collection = COLLECTIONS[collection_id];
            await collection.delete({ ids: [id] });
            console.info(`del orphan ${collection_id} ${id}`);
        } else {
            console.error(e);
        }

        return null;
    }
}

export async function fs_upsert({
    collection_id,
    id,
    content,
}: {
    collection_id: string;
    id: string;
    content: string;
}) {
    try {
        const file_path = path.join(CONFIG.collections[collection_id], id);
        await fs.writeFile(file_path, content, "utf-8");
    } catch (e) {
        console.error(e);
    }
}

export async function fs_delete({
    collection_id,
    id,
}: {
    collection_id: string;
    id: string;
}) {
    try {
        const file_path = path.join(CONFIG.collections[collection_id], id);
        await fs.unlink(file_path);
    } catch (e) {
        console.error(e);
    }
}

export async function fs_status({
    collection_id,
    id,
}: {
    collection_id: string;
    id: string;
}) {
    try {
        const file_path = path.join(CONFIG.collections[collection_id], id);
        const stats = await fs.stat(file_path);

        return {
            atime: stats.atime,
            mtime: stats.mtime,
            ctime: stats.ctime,
            birthtime: stats.birthtime,
        };
    } catch (e) {
        console.error(e);
        return null;
    }
}
