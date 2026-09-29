<p align="center">
  <img src="./docs/assets/awsome-logo-transparent.png" alt="awsome logo" width="400" />
</p>

`awsome` is an Electron desktop app for visualizing AWS infrastructure as an interactive topology graph and turning a live snapshot into an editable architecture plan.

It uses a Vite + React frontend and a companion Rust process. Rust reads the selected local AWS profile, fetches live resources with the AWS SDK for Rust, transforms them into graph data, and returns it to the Cytoscape UI through Electron's command bridge.

## What It Shows

- VPCs
- Subnets
- EC2 instances
- RDS instances
- Security groups
- Internet gateways
- NAT gateways
- Route tables and their effective subnet associations/routes
- VPC gateway and interface endpoints
- VPC peering connections
- Egress-only internet gateways
- Transit Gateways, attachments, route tables, and discovered route paths
- Application Load Balancers
- Network Load Balancers
- Load-balancer listeners, default actions, and custom routing rules (including conditions and weighted forwarding)
- Load-balancer target groups, health-check configuration, and registered EC2, IP, Lambda, and ALB targets

awsome also includes a Planning mode for arranging AWS services on a manual architecture canvas without changing live infrastructure.

## Planning Architectures

Open **Planning mode** from the top navigation. Planning documents support:

- In-place renaming from the title above the canvas
- Automatic local saving of services, connections, sizes, positions, and the current zoom/pan
- Automatic restoration when Planning mode is opened again
- A local architecture library for switching between multiple saved designs
- Undo/redo controls and keyboard shortcuts for recovering autosaved edits
- Direct removal of services and individual connections
- Editable labels on each connection, carried into saved JSON and diagram exports
- Shareable, self-contained SVG diagram exports in addition to the editable JSON export
- **New architecture**, **Import**, **Export**, and confirmed **Delete** controls

Imported files are validated against the AWS service catalog, and an invalid or incompatible file is left unopened with an explanation in the UI. Importing a document whose id already exists asks before replacing that saved architecture. Deleting an architecture also requires confirmation.

Planning data is stored only on the current device in the app webview's local storage. The library uses a versioned index with one storage entry per architecture and safely imports the older `graphivo.planning.last-document` save without deleting it. JSON files use the versioned `graphivo/planning-document` schema for backward compatibility. Version 1 includes the document id and name, timestamps, nodes (`serviceKey`, custom name, position, size, and optional live-resource provenance), edges, and canvas viewport. If saved local data is corrupt or incompatible, awsome isolates unreadable entries and leaves valid architectures available.

## Stack

- Electron
- Rust
- Vite
- React
- Cytoscape
- AWS SDK for Rust

## How It Works

1. Electron loads the Vite-built React frontend in a desktop window.
2. The UI offers locally configured AWS profiles and the selected account's enabled regions. You can scan one region or select several additional regions.
3. Rust loads the selected AWS profile and region from local AWS shared configuration.
4. The Rust command scans up to three regions concurrently, follows every AWS pagination token, fetches load-balancer listeners, rules, and target registrations with bounded concurrency, and builds nodes and defensible network relationships from the regional inventory.
5. Cytoscape renders the combined result with region filters and selected-resource details. Each successful scan is saved in the app data directory for later offline viewing and comparison.

If an AWS inventory API is unavailable—for example because the selected profile lacks permission—awsome keeps the successfully discovered resources, marks the map as incomplete, and lists the affected inventories in the UI. A multi-region scan keeps successful regions when another region fails. Comparisons exclude inventory scopes that were incomplete in either scan, so missing data is not presented as a confirmed deletion. Internal inventory-task failures still fail the request safely.
If every primary inventory request fails, the load fails instead of presenting an empty graph as a successful scan. After a failed reload, the previous graph remains visible with its original profile, region, load time, and an explicit previous-snapshot warning.

## Live topology to architecture plan

1. In **Live mode**, choose an AWS profile and one or more regions and load the topology.
2. After the load succeeds, select **Open in planning**.
3. awsome creates a deterministic, editable layout containing the discovered network resources, load balancers, target groups, registered targets, and their directed relationships.
4. Select an imported node to inspect its original resource label, resource ID, live type, profile, region, and import provenance. Its planning display name, size, and position can be changed without changing the saved live snapshot.
5. Add services from the planning library or create additional connections to explore the desired “to-be” architecture.

If the planning canvas already contains work, awsome asks whether to append the snapshot, replace the canvas, or cancel. Append preserves existing planning work and skips resources and relationships that were already imported, so importing the same snapshot again does not create duplicates.

## Development

Install dependencies:

```bash
npm install
```

Run the Electron desktop app in development:

```bash
npm run start
```

This builds the Rust companion, starts Vite on port `5173`, and launches Electron against it.

To run the optional read-only AWS inventory smoke test against two regions using the `default` profile:

```bash
AWSOME_SMOKE_REGIONS=ap-southeast-1,ap-southeast-2 CARGO_TARGET_DIR=src-tauri/target cargo test --manifest-path native/Cargo.toml --locked tests::live_multi_region_inventory_smoke -- --ignored
```

Set `AWSOME_SMOKE_PROFILE` to use another local profile.

## Production Flow

Create a production desktop bundle:

```bash
npm run build
```

To only build the static frontend:

```bash
npm run build:web
```

Electron packages the Vite build from `dist/` and the Rust companion in the Debian package; it does not start a local development server in production. The GitHub Actions workflow runs frontend and Rust tests, checks Rust formatting, builds the bundle, launches the installed app in a virtual display, and uploads the `.deb` as a workflow artifact. The native and npm package versions are both `0.2.0`.

On first launch, Electron imports valid saved scans and planning architectures from the previous Tauri installation. It leaves the original data in place, keeps any existing Electron entry when IDs conflict, and reports entries it cannot import. Electron stores planning data under `com.basil.awsome.electron` in the user's configuration directory and scans under the same name in the user's data directory.

## AWS Usage

The app expects AWS credentials to be available on the local machine through AWS shared config/credentials files, using a profile name such as `default`.

You can choose:

- AWS profile
- AWS region

The profile field suggests names from local AWS config and credentials files. The primary region field and **More regions** picker suggest enabled regions returned by AWS; you can still type a region if that lookup is unavailable. The lookup uses the SDK-resolved region when present and falls back to `us-east-1` otherwise. Load the live topology from the app UI. The scan shows each region's progress and status and has a **Cancel scan** button.

Live mode is read-only. It makes regional inventory calls and does not create, update, or delete AWS resources. VPC, subnet, EC2, security-group, RDS, gateway, endpoint, peering, Transit Gateway, route-table, and ELBv2 inventory is fully paginated so large accounts are not silently truncated.

For large inventories, use **Find resource** to search resource names, IDs, types, and returned details. The resource chips above the graph can also narrow the visible topology by service type; the result count makes the active subset clear. Filtering preserves the graph's current pan and zoom. Use **Focus first matching resource** to bring a result into view.

Successful scans are saved automatically. Use **Saved scans** to open one without AWS access, compare it with the displayed topology, or delete it after confirmation. Refreshing the same profile and set of regions also compares the new result with the most recent saved scan for that source. Partial scans identify uncertain changes instead of counting missing inventory as removals, including cross-region relationships whose remote region could not be scanned. Scan summaries are stored separately so the picker does not have to read every full graph; older snapshot files gain summaries when listed. **Storage** shows total disk use and lets you review the exact older scans before removing them while keeping a chosen number per source. Cleanup verifies each saved scan and stops if the candidate list changes after confirmation. Snapshot files contain resource inventory and metadata, so treat the app data directory as account information.

Inside the live topology canvas, use the mouse wheel to zoom around the pointer, drag the background to pan, and drag a resource toward any canvas edge to automatically reveal more workspace in that direction. The fit button restores the complete topology to view.
Short connection captions appear only where they fit between nodes. Hover over a connection or select it to read the full relationship.

## Project Structure

```text
src/                         Vite + React UI
src/planningDocument.mjs     Planning schema, validation, migration, and storage
public/assets/               AWS service assets used by the UI
native/                      Rust AWS companion and migration code
electron/                    Electron main process and preload bridge
src-tauri/                   Retained legacy Tauri source, excluded from the Electron package
```

## Notes

- The AWS inventory backend remains Rust. Electron's Node.js main process manages the desktop window and companion process.
- Planning changes are local architecture-design edits; awsome does not apply them to AWS.
- Returning to Live mode restores the loaded topology independently of planning changes.
- Edges are emitted only when both endpoint resources were discovered. Subnets without an explicit route-table association are connected to the VPC's main route table because that is the effective AWS routing behavior.
- Route targets are shown only when their endpoint was discovered, so the graph does not emit dangling connections. This includes internet gateways, NAT gateways, EC2 instances, VPC endpoints, peering connections, egress-only internet gateways, and Transit Gateways.
- ELBv2 discovery currently visualizes Application and Network Load Balancers. Gateway Load Balancers are outside the supported-resource set.
- Load-balancer paths are shown as load balancer → listener → rule → target group → registered target. Default rule actions are read from listeners; custom rules show priority, conditions, actions, and target-group weights. Only forward actions create target-group routing edges. If listener or rule inventory is unavailable, the UI warns that routing paths may be incomplete.

## License

awsome is licensed under the [MIT License](LICENSE).
