# Agent User

Agent User is an English-language scenario simulation workspace. Upload source material, define a scenario, and use AI agents to model possible outcomes in an interactive graph environment.

## What it does

- Extracts entities and relationships from uploaded documents.
- Builds a knowledge graph and configurable simulation environment.
- Runs multi-agent social simulations across supported platforms.
- Produces reports and lets you explore the resulting agents and graph.

## Requirements

- Node.js 18 or later
- Python 3.11 or 3.12
- An OpenAI-compatible LLM API key
- A Zep Cloud API key

## Setup

1. Copy `.env.example` to `.env` and provide `LLM_API_KEY` and `ZEP_API_KEY`.
2. Install the frontend dependencies:

   ```bash
   npm install
   cd frontend && npm install
   ```

3. Install backend dependencies:

   ```bash
   cd backend && uv sync
   ```

## Run locally

```bash
npm run dev
```

The web app runs at `http://localhost:3000`; the API runs at `http://localhost:5001`.

## Build the frontend

```bash
npm run build
```

## License

This project is distributed under the AGPL-3.0 license. Review the license and the obligations that apply to redistributed or network-deployed versions before shipping.
