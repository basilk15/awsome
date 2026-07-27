<p align="center">
  <img src="./docs/assets/awsome-logo-transparent.png" alt="awsome logo" width="400" />
</p>

`Graphivo` is a Tauri desktop app for visualizing AWS infrastructure as an interactive topology graph.

It uses a lightweight Vite + React frontend and a native Rust backend. The Rust backend reads the selected local AWS profile, fetches live resources with the AWS SDK for Rust, transforms them into graph data, and returns it to the Cytoscape UI through a Tauri command.

## What It Shows

- VPCs
- Subnets
- EC2 instances
- RDS instances
- Security groups

## Stack

- Tauri 2
- Rust
- Vite
- React
- Cytoscape
- AWS SDK for Rust

## How It Works

1. Tauri loads the Vite-built React frontend in a native desktop window.
2. The UI calls Tauri's typed `fetch_topology` command.
3. Rust loads the selected AWS profile and region from local AWS shared configuration.
4. The Rust command fetches AWS resources and builds nodes and edges, including VPC-to-security-group relationships.
5. Cytoscape renders the result and the UI exposes selected-resource details.

## Development

Install dependencies:

```bash
npm install
```

Run the Tauri desktop app in development:

```bash
npm run start
```

This starts Vite on port `5173` and launches the Tauri desktop window against it.

## Production Flow

Create a production desktop bundle:

```bash
npm run build
```

To only build the static frontend:

```bash
npm run build:web
```

Tauri packages the Vite build from `dist/` inside the native application; it does not start a local Node.js server in production.

## AWS Usage

The app expects AWS credentials to be available on the local machine through AWS shared config/credentials files, using a profile name such as `default`.

You can choose:

- AWS profile
- AWS region

Then load the live topology from the app UI.

## Project Structure

```text
src/                  Vite + React UI
public/assets/        AWS service assets used by the UI
src-tauri/            Tauri configuration and Rust AWS topology command
```

## Notes

- There is no Electron, Next.js, or Node.js AWS backend in the app runtime.
- The current app focuses on live topology visualization rather than infrastructure editing or apply workflows.
