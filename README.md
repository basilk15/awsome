<p align="center">
  <img src="./docs/assets/awsome-logo-transparent.png" alt="awsome logo" width="400" />
</p>

`awsome` is an Electron + Next.js desktop app for visualizing AWS infrastructure as an interactive topology graph.

It uses a single unified Next.js frontend and an Electron preload bridge to fetch AWS resources from a local AWS profile, transform them into graph data, and render them with Cytoscape.

## What It Shows

- VPCs
- Subnets
- EC2 instances
- RDS instances
- Security groups

## Stack

- Electron
- Next.js
- React
- Cytoscape
- AWS SDK for JavaScript

## How It Works

1. The Electron main process creates the desktop window and exposes a safe IPC bridge through `preload.js`.
2. The Next.js UI calls `window.awsAPI.fetchTopology()`.
3. The backend fetches AWS resources using the selected local profile and region.
4. The graph builder converts those resources into nodes and edges.
5. Cytoscape renders the topology in the desktop UI.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run start
```

This starts:

- Next.js on port `3000`
- Electron connected to the Next.js dev server

## Production Flow

Build the Next.js app:

```bash
npm run build:web
```

Start Electron in production mode:

```bash
npm run start:electron
```

In production, Electron starts a local Next.js server from the built `.next` output and loads that app inside the desktop window.

## AWS Usage

The app expects AWS credentials to be available on the local machine through AWS shared config/credentials files, using a profile name such as `default`.

You can choose:

- AWS profile
- AWS region

Then load the live topology from the app UI.

## Project Structure

```text
backend/              AWS fetching and graph building
pages/                Next.js UI
public/assets/        AWS service assets used by the UI
styles/               Next.js styling
main.js               Electron main process
preload.js            Electron preload bridge
```

## Notes

- The legacy plain Electron renderer has been removed.
- The backend fetch and graph-building logic remain unchanged.
- The current app focuses on live topology visualization rather than infrastructure editing/apply workflows.
