import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import {
    FILES_DIR_PATH,
    ASSETS_DIR_PATH,
    IPFS_GATEWAY,
    DOWNLOAD_RATE_LIMIT_MS,
    MIME_EXTENSION_MAP,
    MAX_RETRIES,
    RETRY_BASE_DELAY
} from './constants.js';

let lastDownloadTime = 0;

function getMimeExtension(mimeType) {
    return MIME_EXTENSION_MAP[mimeType?.toLowerCase()] || '.bin';
}

async function checkFileExistsByCID(cid, directoryPath) {
    try {
        const files = await readdir(directoryPath);
        for (const file of files) {
            if (file.startsWith(cid + '.')) {
                return join(directoryPath, file);
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function downloadFromIPFS(cid, targetDir = FILES_DIR_PATH) {
    const existingFilePath = await checkFileExistsByCID(cid, targetDir);
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

        await mkdir(targetDir, { recursive: true });

        const filename = `${cid}${extension}`;
        const filePath = join(targetDir, filename);
        await writeFile(filePath, buffer);

        return { cid, extension, path: filePath, size: buffer.length };
    } catch (error) {
        console.error(`Warning: Failed to download IPFS file ${cid}: ${error.message}`);
        return { cid, error: error.message };
    }
}

async function downloadFromIPFSWithRetry(cid, targetDir = ASSETS_DIR_PATH) {
    const existingFilePath = await checkFileExistsByCID(cid, targetDir);
    if (existingFilePath) {
        return { cid, skipped: true, path: existingFilePath };
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

            if (response.status === 429) {
                const retryAfter = response.headers.get('retry-after');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_BASE_DELAY * Math.pow(2, attempt);
                
                if (attempt < MAX_RETRIES) {
                    console.log(`Rate limited (429) for ${cid}, waiting ${waitTime}ms before retry ${attempt + 1}/${MAX_RETRIES}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else {
                    throw new Error(`HTTP 429: Rate limited after ${MAX_RETRIES} retries`);
                }
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            const extension = getMimeExtension(contentType);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            await mkdir(targetDir, { recursive: true });

            const filename = `${cid}${extension}`;
            const filePath = join(targetDir, filename);
            await writeFile(filePath, buffer);

            return { cid, extension, path: filePath, size: buffer.length };
        } catch (error) {
            lastError = error;
            // Check if error is a 429 rate limit (could be in message or status)
            const isRateLimit = error.message?.includes('429') || 
                                error.message?.toLowerCase().includes('rate limit');
            
            if (isRateLimit && attempt < MAX_RETRIES) {
                const waitTime = RETRY_BASE_DELAY * Math.pow(2, attempt);
                console.log(`Rate limited (429) for ${cid}, waiting ${waitTime}ms before retry ${attempt + 1}/${MAX_RETRIES}...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            if (attempt === MAX_RETRIES) {
                console.error(`Warning: Failed to download IPFS file ${cid} after ${MAX_RETRIES} retries: ${error.message}`);
                return { cid, error: error.message };
            }
            // For other errors, wait a bit before retrying
            if (attempt < MAX_RETRIES) {
                const waitTime = RETRY_BASE_DELAY * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    return { cid, error: lastError?.message || 'Unknown error' };
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

export async function extractCIDsFromFiles() {
    const cids = new Set();
    
    try {
        const files = await readdir(FILES_DIR_PATH);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
            try {
                const filePath = join(FILES_DIR_PATH, file);
                const content = await readFile(filePath, 'utf8');
                const jsonData = JSON.parse(content);

                if (jsonData.filehashes && Array.isArray(jsonData.filehashes)) {
                    for (const filehash of jsonData.filehashes) {
                        if (filehash.cid && typeof filehash.cid === 'string' && filehash.cid.length > 0) {
                            cids.add(filehash.cid);
                        }
                    }
                }
            } catch (error) {
                // Skip files that can't be parsed
                continue;
            }
        }
    } catch (error) {
        console.log('No files directory found, skipping CID extraction.');
        return [];
    }

    return Array.from(cids);
}

export async function downloadCIDsToAssets() {
    const cids = await extractCIDsFromFiles();
    
    if (cids.length === 0) {
        console.log('\nNo CIDs found in downloaded files to download as assets.');
        return;
    }

    console.log(`\nDownloading ${cids.length} asset CID(s) from IPFS to assets directory...`);
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < cids.length; i++) {
        const cid = cids[i];
        const result = await downloadFromIPFSWithRetry(cid, ASSETS_DIR_PATH);
        
        if (result.error) {
            failed++;
        } else if (result.skipped) {
            skipped++;
        } else {
            downloaded++;
        }
        
        if ((i + 1) % 10 === 0 || i === cids.length - 1) {
            process.stdout.write(`\rDownloaded ${downloaded}/${cids.length} assets (${skipped} skipped, ${failed} failed)...`);
        }
    }

    console.log(`\nAsset download complete: ${downloaded} new file(s), ${skipped} already existed, ${failed} failed.`);
}

