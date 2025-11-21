# Rehydrator

A one-shot utility program for examining `MappingUpdated` events from an Ethereum smart contract on Base chain. This tool queries blockchain events, downloads associated IPFS content, and generates summary reports.

## License

MIT License - This project is provided as-is. Feel free to copy, modify, and use it however you want.

## Status

**This project is not actively maintained.** It was created as a utility script for a specific task. You're welcome to fork it, modify it, and maintain your own version.

## Overview

Rehydrator scans blockchain events from a specified contract, extracts IPFS content identifiers (CIDs), downloads the associated files, and generates comprehensive reports. It includes features like:

- Automatic resumption from the last processed block
- RPC endpoint management with retry logic
- IPFS file downloading with rate limiting
- Progress tracking and summary generation

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file or set environment variables:

```env
# Contract and chain configuration
CONTRACT_ADDRESS=0xcb845a74503FF0c0bF85030d87829181e2b6276f
STARTING_BLOCK=30974622
CHAIN=base

# RPC configuration
RPC_BASE=https://base-rpc.publicnode.com

# Optional: Customize behavior
DATA_DIR=data                    # Output directory
DEFAULT_BLOCK_RANGE=50000        # Default block range if no starting block
BLOCK_CHUNK_SIZE=10000           # Blocks to query per batch
DOWNLOAD_RATE_LIMIT_MS=1000      # Rate limit for IPFS downloads
MAX_RETRIES=3                    # Maximum retry attempts
RETRY_BASE_DELAY=1000            # Base delay for exponential backoff
RPC_SKIP_COUNT_RETRYABLE=3       # Skip count for retryable RPC errors
RPC_SKIP_COUNT_NON_RETRYABLE=10  # Skip count for non-retryable RPC errors
IPFS_GATEWAY=https://ipfs.io/ipfs # IPFS gateway URL
```

## Usage

```bash
npm start
```

Or directly:

```bash
node index.js
```

## How It Works

### Step 1: Initialization
- Loads configuration from environment variables
- Checks for existing progress (`lastblock.txt`) to resume from
- Creates a Courier instance with RPC connection management

### Step 2: Block Range Calculation
- Determines the starting block (from `STARTING_BLOCK` or saved progress)
- Gets the current blockchain block number
- Calculates the range to scan

### Step 3: Event Querying
- Queries `MappingUpdated` events in chunks (default: 10,000 blocks per chunk)
- Processes each chunk sequentially with progress indicators
- Handles RPC errors with automatic retry and endpoint switching
- Saves progress after each chunk to enable resumption

### Step 4: Event Processing
- For each event found:
  - Fetches the block timestamp
  - Extracts the CID (Content Identifier) from event arguments
  - Saves events grouped by block number to JSON files
- Downloads IPFS files referenced in events (with rate limiting)

### Step 5: File Download
- Checks if IPFS files already exist locally
- Downloads missing files from IPFS gateway
- Determines file extensions based on MIME types
- Saves files with CID-based naming

### Step 6: Summary Generation
- Analyzes downloaded JSON files for nested CIDs
- Builds a comprehensive summary of all CIDs found
- Displays statistics including:
  - Earliest block appearance
  - Timestamp
  - Occurrence count

### Step 7: Export Results
- Generates CSV file with all events
- Displays formatted table in console

## Output Files

All output files are saved in the `data/` directory (or `DATA_DIR` if specified).

### `lastblock.txt`
- Contains the last processed block number
- Used for resuming interrupted scans
- Format: Single line with block number (e.g., `38478903`)

### `results.csv`
- CSV export of all events found
- Columns: `TransactionHash`, `BlockNumber`, `Timestamp`, `CID`
- Useful for data analysis in spreadsheet applications

### `block_<NUMBER>.json`
- Individual JSON files for each block containing events
- One file per block that had events
- Contains full event data including:
  - Event name and arguments
  - Transaction hash and index
  - Block number and timestamp
  - Log index and other metadata

### `files/<CID>.<extension>`
- Downloaded IPFS files
- Files are named using their CID with appropriate extensions
- Extensions determined by MIME type (`.json`, `.jpg`, `.png`, etc.)
- If a file already exists, it's skipped to avoid re-downloading

## Example Output

```
Fetching UpdateMapping events using Courier.getHistory...
Contract: 0xcb845a74503FF0c0bF85030d87829181e2b6276f
Original Starting Block: 30974622
Chain: base

Getting current block...
Current block: 38478903
Starting from block: 30974622

[0.0%] Querying blocks 30974622 to 30984622... Found 1 events
[1.3%] Querying blocks 30984622 to 30994622... Found 0 events
...

[100%] Found 32 total events.

CID Summary:
========================================================================================================================
CID                                                  EARLIEST BLOCK    TIMESTAMP                  COUNT      
========================================================================================================================
QmZurDxJuAFYQmuM67m1iPaYTrT2QABHYSuisRkmBx6hbD      31094360          2025-06-03 19:14:27        1          
...

Total unique CIDs: 15
Total occurrences: 32
```

## Resuming Interrupted Scans

If the program is interrupted, simply run it again. It will automatically:
- Detect the last processed block from `lastblock.txt`
- Load existing events from `block_*.json` files
- Continue from where it left off
- Only download new IPFS files (skips existing ones)

## Project Structure

```
├── index.js              # Main entry point
├── courier.js            # Core Courier class with getHistory method
├── constants.js          # Configuration constants
├── rpc-manager.js        # RPC endpoint selection and management
├── file-io.js            # File persistence operations
├── ipfs-downloader.js    # IPFS file downloading
├── event-processor.js    # Event processing and serialization
├── summary-builder.js    # CID summary generation
├── retry-utils.js        # Retry logic and error classification
└── data/                 # Output directory
    ├── lastblock.txt
    ├── results.csv
    ├── block_*.json
    └── files/
        └── <CID>.*
```

## Dependencies

- `viem` - Ethereum library for interacting with blockchain
- `dotenv` - Environment variable management

## Notes

- The program uses a dummy private key for read-only operations
- RPC endpoints are managed with automatic failover and retry logic
- IPFS downloads are rate-limited to avoid overwhelming gateways
- All BigInt values are properly serialized for JSON output

## Contributing

This project is not actively maintained. Feel free to fork and modify as needed for your own use case.

