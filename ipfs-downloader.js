import { writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import {
    FILES_DIR_PATH,
    IPFS_GATEWAY,
    DOWNLOAD_RATE_LIMIT_MS,
    MIME_EXTENSION_MAP
} from './constants.js';

let lastDownloadTime = 0;

function getMimeExtension(mimeType) {
    return MIME_EXTENSION_MAP[mimeType?.toLowerCase()] || '.bin';
}

async function checkFileExistsByCID(cid) {
    try {
        const files = await readdir(FILES_DIR_PATH);
        for (const file of files) {
            if (file.startsWith(cid + '.')) {
                return join(FILES_DIR_PATH, file);
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function downloadFromIPFS(cid) {
    const existingFilePath = await checkFileExistsByCID(cid);
    if (existingFilePath) {
        return { cid, skipped: true, path: existingFilePath };
    }

    const now = Date.now();
    const timeSinceLastDownload = now - lastDownloadTime;
    if (timeSinceLastDownload < DOWNLOAD_RATE_LIMIT_MS) {
        const waitTime = DOWNLOAD_RATE_LIMIT_MS - timeSinceLastDownload;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastDownloadTime = Date.now();

    try {
        const url = `${IPFS_GATEWAY}/${cid}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        const extension = getMimeExtension(contentType);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await mkdir(FILES_DIR_PATH, { recursive: true });

        const filename = `${cid}${extension}`;
        const filePath = join(FILES_DIR_PATH, filename);
        await writeFile(filePath, buffer);

        return { cid, extension, path: filePath, size: buffer.length };
    } catch (error) {
        console.error(`Warning: Failed to download IPFS file ${cid}: ${error.message}`);
        return { cid, error: error.message };
    }
}

export async function downloadCIDsFromEvents(events) {
    const cids = new Set();
    for (const event of events) {
        const cid = event.args?.value || event.args?.[0];
        if (cid && typeof cid === 'string' && cid.length > 0) {
            cids.add(cid);
        }
    }

    if (cids.size === 0) return;

    console.log(`\nDownloading ${cids.size} file(s) from IPFS...`);
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const cid of cids) {
        const result = await downloadFromIPFS(cid);
        if (result.error) {
            failed++;
        } else if (result.skipped) {
            skipped++;
        } else {
            downloaded++;
            if (downloaded % 10 === 0) {
                process.stdout.write(`\rDownloaded ${downloaded}/${cids.size} files...`);
            }
        }
    }

    if (downloaded > 0 || skipped > 0 || failed > 0) {
        console.log(`\nDownloaded ${downloaded} new file(s), ${skipped} already existed, ${failed} failed.`);
    }
}

