import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DATA_DIR = process.env.DATA_DIR || 'data';
export const DATA_DIR_PATH = join(__dirname, DATA_DIR);
export const FILES_DIR_PATH = join(__dirname, DATA_DIR, 'files');
export const LAST_BLOCK_FILE = join(__dirname, DATA_DIR, 'lastblock.txt');
export const RESULTS_CSV_FILE = join(__dirname, DATA_DIR, 'results.csv');

export const DEFAULT_BLOCK_RANGE = BigInt(process.env.DEFAULT_BLOCK_RANGE || '50000');
export const BLOCK_CHUNK_SIZE = BigInt(process.env.BLOCK_CHUNK_SIZE || '10000');
export const DOWNLOAD_RATE_LIMIT_MS = parseInt(process.env.DOWNLOAD_RATE_LIMIT_MS || '1000');

export const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
export const RETRY_BASE_DELAY = parseInt(process.env.RETRY_BASE_DELAY || '1000');
export const RPC_SKIP_COUNT_RETRYABLE = parseInt(process.env.RPC_SKIP_COUNT_RETRYABLE || '3');
export const RPC_SKIP_COUNT_NON_RETRYABLE = parseInt(process.env.RPC_SKIP_COUNT_NON_RETRYABLE || '10');

export const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs';

export const BLOCK_FILE_PREFIX = 'block_';
export const BLOCK_FILE_SUFFIX = '.json';

export const MIME_EXTENSION_MAP = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/json': '.json',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-tar': '.tar',
    'application/gzip': '.gz',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
};

export const RETRYABLE_ERROR_PATTERNS = [
    'rate limit',
    'too many request',
    '429',
    'timeout',
    'network',
    'connection',
    'econnreset',
    'econnrefused',
    'enotfound',
    'internal error',
    'range is too large',
    'too large'
];

export const NON_RETRYABLE_ERROR_PATTERNS = [
    'unauthorized',
    '401',
    '403',
    'forbidden'
];

