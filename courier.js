import { createWalletClient, http, webSocket, publicActions, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';
import { createRpcManager } from './rpc-manager.js';
import { withRetry } from './retry-utils.js';
import { loadLastBlock, loadExistingEvents, saveLastBlock, saveResultsToCSV } from './file-io.js';
import { downloadCIDsFromEvents, downloadCIDsToAssets } from './ipfs-downloader.js';
import { processAndSaveChunkEvents } from './event-processor.js';
import { buildAndPrintCIDSummary } from './summary-builder.js';
import {
    DEFAULT_BLOCK_RANGE,
    BLOCK_CHUNK_SIZE
} from './constants.js';

export function createCourier(chain, privateKey, rpc) {
    const rpcUrls = {
        base: (process.env.RPC_BASE || '').split(',').filter(Boolean)
    };

    let transport;
    let usedRpc, usedRpcIndex;
    let rpcManager = null;
    let actions;

    if (!rpc && rpcUrls[chain]?.length > 0) {
        rpcManager = createRpcManager(chain, rpcUrls);
        const selection = rpcManager.selectRpc();
        usedRpc = selection.usedRpc;
        usedRpcIndex = selection.usedRpcIndex;
        transport = usedRpc.startsWith('wss') ? webSocket(usedRpc) : http(usedRpc);
    } else {
        transport = http();
    }

    const account = privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}`);
    actions = createWalletClient({
        account,
        chain: chains[chain],
        transport,
    }).extend(publicActions);

    const markRpcErrorLocal = (skipFor = 3) => {
        if (rpcManager && typeof usedRpcIndex === 'number') {
            rpcManager.markRpcError(usedRpcIndex, skipFor);
        }
    };

    const markRpcSuccessLocal = () => {
        if (rpcManager && typeof usedRpcIndex === 'number') {
            rpcManager.markRpcSuccess(usedRpcIndex);
        }
    };

    const switchRpc = () => {
        if (rpcManager) {
            const selection = rpcManager.selectRpc();
            const newRpc = selection.usedRpc;
            const newRpcIndex = selection.usedRpcIndex;

            const newTransport = newRpc.startsWith('wss') ? webSocket(newRpc) : http(newRpc);
            actions = createWalletClient({
                account,
                chain: chains[chain],
                transport: newTransport,
            }).extend(publicActions);

            usedRpcIndex = newRpcIndex;
            console.log(`Switched to RPC: ${newRpc}`);
        }
    };

    const courier = {
        markRpcError: markRpcErrorLocal,
        markRpcSuccess: markRpcSuccessLocal,
        switchRpc
    };

    const calculateStartingBlock = (startingBlock, currentBlock) => {
        if (startingBlock) {
            return startingBlock > 0
                ? BigInt(startingBlock)
                : currentBlock + BigInt(startingBlock);
        }
        return currentBlock - DEFAULT_BLOCK_RANGE;
    };

    const handleResume = async (originalStartPos, currentBlock) => {
        const savedLastBlock = await loadLastBlock();
        if (savedLastBlock !== null && savedLastBlock > originalStartPos) {
            console.log(`Resuming from saved last block: ${savedLastBlock} (was going to start from ${originalStartPos})`);

            const existingEvents = await loadExistingEvents();
            await downloadCIDsFromEvents(existingEvents);

            const effectiveStartPos = savedLastBlock;
            return {
                startPos: effectiveStartPos,
                existingEvents,
                existingEventsCount: existingEvents.length,
                isResuming: true
            };
        }

        const startPos = originalStartPos;
        return {
            startPos,
            existingEvents: [],
            existingEventsCount: 0,
            isResuming: false
        };
    };

    const queryBlockRange = async (contractAddress, searchAbi, fromBlock, toBlock, currentBlock, originalStartPos) => {
        const blocksProcessed = fromBlock - originalStartPos;
        const totalBlocksFromOriginal = currentBlock - originalStartPos;
        const percentComplete = totalBlocksFromOriginal > 0n
            ? ((Number(blocksProcessed) / Number(totalBlocksFromOriginal)) * 100).toFixed(1)
            : '0.0';

        process.stdout.write(`\r[${percentComplete}%] Querying blocks ${fromBlock} to ${toBlock}...`);

        try {
            const logs = await actions.getLogs({
                address: contractAddress,
                event: searchAbi[0],
                fromBlock,
                toBlock
            });

            if (logs.length > 0) {
                process.stdout.write(` Found ${logs.length} events`);
                const processedEvents = await processAndSaveChunkEvents(logs, actions);
                await saveLastBlock(toBlock);
                return processedEvents;
            } else {
                await saveLastBlock(toBlock);
                return logs;
            }
        } catch (e) {
            process.stdout.write(` Error: ${e.message?.substring(0, 50) || 'Unknown error'}`);
            throw e;
        }
    };

    const getHistory = async (contractAddress, startingBlock, isFullMode = false) => {
        console.time('timer');
        try {
            return await withRetry(async () => {
                console.log('Getting current block...');
                const currentBlock = await actions.getBlockNumber();
                console.log(`Current block: ${currentBlock}`);

                const originalStartPos = calculateStartingBlock(startingBlock, currentBlock);
                const resumeData = await handleResume(originalStartPos, currentBlock);

                const { startPos, existingEvents, existingEventsCount, isResuming } = resumeData;
                const data = [...existingEvents];

                console.log(`Starting from block: ${startPos}`);

                const searchAbi = parseAbi(['event MappingUpdated(string value)']);

                for (let blockPos = startPos; blockPos < currentBlock; blockPos += BLOCK_CHUNK_SIZE) {
                    const toBlock = blockPos + BLOCK_CHUNK_SIZE > currentBlock
                        ? currentBlock
                        : blockPos + BLOCK_CHUNK_SIZE;

                    const events = await queryBlockRange(
                        contractAddress,
                        searchAbi,
                        blockPos,
                        toBlock,
                        currentBlock,
                        originalStartPos
                    );
                    data.push(...events);
                }

                const newEventsCount = data.length - existingEventsCount;
                if (isResuming && existingEventsCount > 0) {
                    console.log(`\n[100%] Found ${newEventsCount} new events (${data.length} total including ${existingEventsCount} existing).`);
                } else {
                    console.log(`\n[100%] Found ${data.length} total events.`);
                }

                await buildAndPrintCIDSummary(data);
                await saveResultsToCSV(data);
                
                // If full mode is enabled, download asset CIDs from parsed files
                if (isFullMode) {
                    await downloadCIDsToAssets();
                }
                
                return data;
            }, courier);
        } finally {
            console.timeEnd('timer');
        }
    };

    courier.getHistory = getHistory;
    return courier;
}
