# CustomsX

CustomsX is a blockchain-based customs clearance system that combines Artificial Intelligence (AI), zero-knowledge proofs, and smart contracts.

The project helps verify customs duty calculations while protecting sensitive shipment information.

## Features

- AI-assisted shipment classification.
- PDF document processing.
- Zero-knowledge proof generation using Noir.
- Smart contract verification using Solidity.
- Blockchain-based cargo clearance records.
- Exporter and Inspector dashboards.

## Project Structure

```text
customsx/
├── ai-service/       # AI classification and FastAPI backend
├── blockchain/       # Solidity smart contracts
├── frontend/         # Next.js web application
└── zk/               # Noir zero-knowledge proof program
## Requirements

Before running CustomsX, make sure you have:

- Node.js 22 or later
- Python 3
- Foundry and Anvil
- Nargo (Noir)
- Barretenberg (`bb`)
- A Groq API key

### Configure WSL

Run this command in your Ubuntu terminal:

```bash
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"

## Running the AI Backend

Open an Ubuntu terminal and run:

```bash
cd "/mnt/c/Users/Nihira/OneDrive/Documents/customsx"
source ~/customsx-venv/bin/activate
uvicorn app:api --app-dir ai-service --host 127.0.0.1 --port 8000

## Running the Zero-Knowledge Proof Tests

Make sure Noir (`nargo`) and Barretenberg (`bb`) are installed and available in your PATH.

Run the following commands from the project root:

```bash
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
cd zk
nargo test

## Running the Local Blockchain

CustomsX uses Anvil, a local Ethereum development node, for blockchain testing.

From the project root, run:

```bash
cd blockchain
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --state ./customsx-anvil-state.json --state-interval 30

## Running the Frontend

Open a new Ubuntu terminal, navigate to the project, and run:

```bash
cd "/mnt/c/Users/Nihira/OneDrive/Documents/customsx/frontend"
npm install
npm run dev

### Frontend Environment Variables

Create a `.env.local` file inside the `frontend` directory and configure:

```dotenv
NEXT_PUBLIC_AI_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CUSTOMS_CONTRACT_ADDRESS= 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
```
## API Endpoints

The FastAPI backend provides the following endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/classify` | Classifies shipment information |
| POST | `/classify-pdf` | Extracts and classifies information from a PDF |
| POST | `/generate-proof` | Generates a zero-knowledge proof |

For request details and testing, open the interactive API documentation at:

http://127.0.0.1:8000/docs

## Security Notes

- Never commit API keys, private keys, passwords, or secret environment files.
- Keep `.env` and `.env.local` files out of version control.
- Use `.env.example` files to document required environment variables without including secrets.
- Do not publish local blockchain state files.
- The project is configured for local development and testing.

## Development Notes

CustomsX is a development project that demonstrates how AI, zero-knowledge proofs, and blockchain technology can work together in a customs clearance workflow.

The local Anvil network uses chain ID `31337`. Contract addresses may change when contracts are redeployed.

For the best development experience, keep the AI backend and Anvil running in separate terminals while using the frontend.
