import {
    RPC_SKIP_COUNT_RETRYABLE,
    RPC_SKIP_COUNT_NON_RETRYABLE
} from './constants.js';

const rpcRoundRobinIndex = {};
const rpcStatus = {};

function logRpcScores(chain, rpcUrls) {
    if (!rpcStatus[chain]) return;
    console.log(`RPC scores for chain '${chain}':`);
    rpcUrls[chain].forEach((url, i) => {
        const status = rpcStatus[chain][i];
        console.log(`  [${i}] ${url} - skipCount: ${status.skipCount}, errorCount: ${status.errorCount}, successCount: ${status.successCount}`);
    });
}

function markRpcError(chain, rpcIndex, rpcUrls, skipFor = RPC_SKIP_COUNT_RETRYABLE) {
    if (!rpcStatus[chain] || !rpcStatus[chain][rpcIndex]) return;
    rpcStatus[chain][rpcIndex].errorCount++;
    rpcStatus[chain][rpcIndex].skipCount = skipFor;
    logRpcScores(chain, rpcUrls);
}

function markRpcSuccess(chain, rpcIndex, rpcUrls) {
    if (!rpcStatus[chain] || !rpcStatus[chain][rpcIndex]) return;
    rpcStatus[chain][rpcIndex].successCount++;
    rpcStatus[chain][rpcIndex].skipCount = 0;
    logRpcScores(chain, rpcUrls);
}

function selectRpcUrl(chain, rpcUrls) {
    if (!rpcStatus[chain]) {
        rpcStatus[chain] = rpcUrls[chain].map(() => ({ skipCount: 0, errorCount: 0, successCount: 0 }));
    }
    if (typeof rpcRoundRobinIndex[chain] !== 'number') {
        rpcRoundRobinIndex[chain] = 0;
    }

    const numRpcUrls = rpcUrls[chain].length;
    const startIdx = rpcRoundRobinIndex[chain];
    let usedRpcIndex = -1;
    let found = false;
    let minErr = rpcStatus[chain][startIdx].errorCount;
    let minErrIdx = startIdx;

    for (let i = 0; i < numRpcUrls; i++) {
        const idx = (startIdx + i) % numRpcUrls;
        if (rpcStatus[chain][idx].skipCount > 0) {
            rpcStatus[chain][idx].skipCount--;
        }
        if (rpcStatus[chain][idx].skipCount === 0 && !found) {
            usedRpcIndex = idx;
            found = true;
        }
        if (rpcStatus[chain][idx].errorCount < minErr) {
            minErr = rpcStatus[chain][idx].errorCount;
            minErrIdx = idx;
        }
    }

    if (!found) {
        usedRpcIndex = minErrIdx;
    }

    const usedRpc = rpcUrls[chain][usedRpcIndex];
    rpcRoundRobinIndex[chain] = (usedRpcIndex + 1) % numRpcUrls;

    return { usedRpc, usedRpcIndex };
}

export function createRpcManager(chain, rpcUrls) {
    const markRpcErrorLocal = (rpcIndex, skipFor = RPC_SKIP_COUNT_RETRYABLE) => {
        markRpcError(chain, rpcIndex, rpcUrls, skipFor);
    };

    const markRpcSuccessLocal = (rpcIndex) => {
        markRpcSuccess(chain, rpcIndex, rpcUrls);
    };

    const selectRpc = () => {
        return selectRpcUrl(chain, rpcUrls);
    };

    return {
        markRpcError: markRpcErrorLocal,
        markRpcSuccess: markRpcSuccessLocal,
        selectRpc
    };
}

