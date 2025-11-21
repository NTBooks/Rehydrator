import {
    MAX_RETRIES,
    RETRY_BASE_DELAY,
    RPC_SKIP_COUNT_RETRYABLE,
    RPC_SKIP_COUNT_NON_RETRYABLE,
    RETRYABLE_ERROR_PATTERNS,
    NON_RETRYABLE_ERROR_PATTERNS
} from './constants.js';

export function isRetryableError(error) {
    const errorMessage = (error.message?.toLowerCase() || '') +
        (error.details?.toLowerCase() || '') +
        (error.cause?.details?.toLowerCase() || '') +
        (error.shortMessage?.toLowerCase() || '');
    const errorStatus = error.status;

    if (errorStatus === 429) {
        return true;
    }

    for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
        if (errorMessage.includes(pattern)) {
            return false;
        }
    }

    for (const pattern of RETRYABLE_ERROR_PATTERNS) {
        if (errorMessage.includes(pattern)) {
            return true;
        }
    }

    return true;
}

export async function withRetry(operation, courierInstance, maxRetries = MAX_RETRIES, baseDelay = RETRY_BASE_DELAY) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            if (courierInstance?.markRpcSuccess) {
                courierInstance.markRpcSuccess();
            }
            return result;
        } catch (error) {
            lastError = error;
            const isRetryable = isRetryableError(error);

            if (courierInstance?.markRpcError) {
                const skipFor = isRetryable
                    ? RPC_SKIP_COUNT_RETRYABLE
                    : RPC_SKIP_COUNT_NON_RETRYABLE;
                console.log(`Marking RPC error - isRetryable: ${isRetryable}, skipFor: ${skipFor}, attempt: ${attempt}`);
                courierInstance.markRpcError(skipFor);
            }

            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }

            if (courierInstance?.switchRpc) {
                courierInstance.switchRpc();
            }

            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`RPC call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            console.log(`Retrying now (attempt ${attempt + 2}/${maxRetries + 1})...`);
        }
    }

    throw lastError;
}

