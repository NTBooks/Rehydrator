import 'dotenv/config';
import { createCourier } from './courier.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || 'data';
const LAST_BLOCK_FILE = join(__dirname, DATA_DIR, 'lastblock.txt');

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xcb845a74503FF0c0bF85030d87829181e2b6276f';
const STARTING_BLOCK = BigInt(process.env.STARTING_BLOCK || '30974622');
const CHAIN = process.env.CHAIN || 'base';

async function loadLastBlock() {
    try {
        const content = await readFile(LAST_BLOCK_FILE, 'utf8');
        const blockNumber = BigInt(content.trim());
        console.log(`Loaded last block from file: ${blockNumber}`);
        return blockNumber;
    } catch (error) {
        console.log(`No last block file found, using default: ${STARTING_BLOCK}`);
        return STARTING_BLOCK;
    }
}

async function getUpdateMappingEvents() {
    // Set RPC_BASE environment variable if not already set
    if (!process.env.RPC_BASE) {
        process.env.RPC_BASE = 'https://base-rpc.publicnode.com';
    }

    // Load the last block checked, or use default
    const lastBlock = await loadLastBlock();

    // Create Courier instance (using a dummy private key since we're only reading)
    // For reading operations, any valid private key format works
    const dummyPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const courier = createCourier(CHAIN, dummyPrivateKey);

    console.log('Fetching UpdateMapping events using Courier.getHistory...');
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    console.log(`Original Starting Block: ${STARTING_BLOCK}`);
    if (lastBlock !== STARTING_BLOCK) {
        console.log(`Resuming from saved block: ${lastBlock}`);
    }
    console.log(`Chain: ${CHAIN}\n`);

    try {
        // Call getHistory with the contract address and original starting block
        // getHistory will handle resuming from saved block internally
        const history = await courier.getHistory(CONTRACT_ADDRESS, STARTING_BLOCK);

        if (history.length === 0) {
            console.log('No UpdateMapping events found.');
            return;
        }

        // Sort by timestamp (oldest first)
        history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Print table
        const TXID_WIDTH = 50;
        const TIMESTAMP_WIDTH = 20;
        const TEXT_VALUE_WIDTH = 52;
        const TOTAL_WIDTH = TXID_WIDTH + TIMESTAMP_WIDTH + TEXT_VALUE_WIDTH;

        console.log('\nUpdateMapping Events:');
        console.log('='.repeat(TOTAL_WIDTH));

        // Header row
        const header = 'TXID'.padEnd(TXID_WIDTH) +
            'TIMESTAMP'.padEnd(TIMESTAMP_WIDTH) +
            'TEXT VALUE';
        console.log(header);
        console.log('='.repeat(TOTAL_WIDTH));

        // Data rows
        history.forEach((item) => {
            const txidShort = item.transactionHash.substring(0, 10) + '...' + item.transactionHash.substring(58);
            const timestamp = item.timestamp.toISOString().replace('T', ' ').substring(0, 19);
            // Extract text value from decoded event args
            const textValue = item.args?.value || item.args?.[0] || item.data || 'N/A';
            const displayValue = textValue.length > TEXT_VALUE_WIDTH
                ? textValue.substring(0, TEXT_VALUE_WIDTH - 3) + '...'
                : textValue;

            const row = txidShort.padEnd(TXID_WIDTH) +
                timestamp.padEnd(TIMESTAMP_WIDTH) +
                displayValue;
            console.log(row);
        });

        console.log('='.repeat(TOTAL_WIDTH));
        console.log(`\nTotal events found: ${history.length}`);

    } catch (error) {
        console.error('Error fetching events:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the script
getUpdateMappingEvents().catch(console.error);
