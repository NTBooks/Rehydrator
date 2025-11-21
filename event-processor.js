import { saveBlockEvents } from './file-io.js';
import { downloadCIDsFromEvents } from './ipfs-downloader.js';

export function serializeEventForJSON(event) {
    const serialized = { ...event };
    if (serialized.blockNumber) serialized.blockNumber = serialized.blockNumber.toString();
    if (serialized.logIndex !== undefined) serialized.logIndex = serialized.logIndex.toString();
    if (serialized.transactionIndex !== undefined) serialized.transactionIndex = serialized.transactionIndex.toString();
    if (serialized.timestamp) serialized.timestamp = serialized.timestamp.toISOString();
    return serialized;
}

export async function processAndSaveChunkEvents(logs, actions) {
    if (logs.length === 0) return [];

    try {
        const eventsWithTimestamps = [];
        for (const log of logs) {
            const block = await actions.getBlock({ blockNumber: log.blockNumber });
            const timestamp = new Date(Number(block.timestamp) * 1000);
            eventsWithTimestamps.push({ ...log, timestamp });
        }

        const eventsByBlock = {};
        for (const event of eventsWithTimestamps) {
            const blockNum = event.blockNumber.toString();
            if (!eventsByBlock[blockNum]) {
                eventsByBlock[blockNum] = [];
            }
            eventsByBlock[blockNum].push(serializeEventForJSON(event));
        }

        for (const [blockNum, blockEvents] of Object.entries(eventsByBlock)) {
            await saveBlockEvents(blockNum, blockEvents);
        }

        await downloadCIDsFromEvents(eventsWithTimestamps);
        return eventsWithTimestamps;
    } catch (error) {
        console.error(`Warning: Failed to save chunk events: ${error.message}`);
        return logs;
    }
}

