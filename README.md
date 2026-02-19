# PondPilot - Get your data 🦆 in a row

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Latest Release](https://img.shields.io/github/v/release/pondpilot/pondpilot)](https://github.com/pondpilot/pondpilot/releases/latest)

## 🚀 What is PondPilot?

PondPilot is a blazing-fast, lightweight, 100% client-side AI-enabled data exploration tool that helps you analyze local & remote data with zero setup. Powered by DuckDB-WASM and integrated AI assistance, it runs entirely in your browser — no install, no servers, no cloud uploads, complete privacy. Whether you're a data analyst, scientist, or engineer, PondPilot helps you get your data ducks in a row without the overhead of traditional data tools.

## 💡 Why PondPilot?

**Traditional data tools have major drawbacks:**

- They require complex setup and installation
- They often send your data to remote servers
- They're resource-intensive and can be slow for large datasets
- Many require paid subscriptions or have usage limits

**PondPilot solves these problems by:**

- Running entirely in your browser with zero installation
- Processing all data locally — your data never leaves your device
- Using DuckDB's lightning-fast SQL engine optimized for analytical queries
- Providing the ability to work directly with your files without making copies
- Being completely free and open-source

## 🔍 Features

### 🔒 Privacy & Security

- **100% Client-Side**: All processing happens in your browser — your sensitive data never leaves your device
- **PWA Support**: Install PondPilot as a Progressive Web App for offline use anywhere
- **Read-only**: PondPilot doesn't write to your files, guaranteeing data safety and integrity
- **Encrypted Secret Store**: API keys and credentials are encrypted with AES-GCM and stored in a dedicated IndexedDB

### ⚡ Performance & Efficiency

- **No data-copy**: Unlike similar tools, PondPilot accesses files directly without copying to browser cache — changes outside PondPilot are reflected in real-time
- **Powered by DuckDB**: Leverage the lightning-fast SQL engine for analyzing millions of rows in seconds
- **Cross-session persistence**: All data handles and queries are automatically saved between sessions

### 🤖 AI-Powered SQL Assistant

- **Natural Language to SQL**: Generate complex SQL queries from simple English descriptions
- **Intelligent Error Fixing**: Automatic suggestions to fix SQL on errors
- **Multiple AI Providers**: Support for OpenAI, Anthropic Claude, and custom OpenAI-compatible endpoints
- **Privacy-First**: Uses your own API keys — your queries and data never leave your control
- **Context-Aware**: Understands your database schema and provides relevant suggestions

### 📊 Data Sources & Formats

- **Local Files**: CSV, Parquet, JSON, XLSX, DuckDB databases, Stata (.dta), SAS (.sas7bdat, .xpt), and SPSS (.sav, .zsav, .por)
- **Remote Databases**: Connect to HTTP/HTTPS endpoints and S3-compatible storage with custom endpoint support
- **Apache Iceberg**: Browse and query Iceberg catalogs with REST, OAuth2, Bearer token, and SigV4 authentication
- **Clipboard Import**: Paste CSV or JSON data directly from your clipboard
- **CORS Proxy**: Built-in proxy support (auto or manual) for accessing remote resources blocked by CORS

### 🧰 Analysis Tools

- **Interactive SQL Editor**: Write and execute SQL with syntax highlighting, auto-completion, and error detection powered by Monaco Editor and FlowScope
- **Charts**: Visualize query results with bar, line, area, scatter, pie, stacked bar, and horizontal bar charts — with aggregation, grouping, color presets, and fullscreen support
- **Data Comparison**: Compare two data sources side-by-side with automatic join key detection, schema diffing, and multiple join strategies (auto, full outer, left, right, inner)
- **Schema Browser**: Explore database schemas with an interactive relationship diagram, directional layout, and mini-map navigation
- **Data Export**: Export results to CSV, TSV, XLSX, Parquet, SQL, XML, or Markdown
- **Convert To**: Right-click any file or table to convert it to a different format

### 🎨 User Experience

- **Keyboard Shortcuts**: Navigate efficiently with intuitive keyboard shortcuts and a spotlight menu
- **Dark/Light Mode**: Choose the interface that's easiest on your eyes, or follow your system preference

## 🚀 Getting Started

### Using the Web App

The easiest way to use PondPilot is through the hosted web app:

1. Visit [https://app.pondpilot.io](https://app.pondpilot.io)
2. Click "Add file" or use keyboard shortcut (`Ctrl+F`) to load your data
3. Start exploring!

### Browser Requirements

PondPilot works across all major browsers with different feature sets:

- **Chrome/Edge**: Full functionality with file persistence and folder selection
- **Firefox/Safari**: Core features with session-only file access (files must be re-selected after refresh). Drag & drop is recommended for the best experience

### Running Locally

#### Using Docker

Run PondPilot with a single command:

```bash
docker run -d -p 4173:80 --name pondpilot ghcr.io/pondpilot/pondpilot:latest
```

Visit `http://localhost:4173` in your browser to access the app.

> **Note:** PWA and offline mode is disabled for the Docker version to avoid conflicts with other apps serving on localhost.

##### Subdirectory Deployment

PondPilot supports deployment in subdirectories alongside other services. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on:

- Building with custom base paths (e.g., `/custompath/`, `/pondpilot/`)
- Configuring nginx reverse proxy
- Docker Compose examples

#### Using Yarn

Alternatively, you can build & run PondPilot using Yarn:

```bash
# Clone the repository
git clone https://github.com/pondpilot/pondpilot.git
cd pondpilot

# Setup the project
corepack enable
yarn

# Start the development server
yarn dev
```

Visit `http://localhost:5173` in your browser to access the app.

## ⌨️ Keyboard Shortcuts

- `Ctrl/⌘ + K`: Open spotlight menu to navigate, add files, create new queries and explore shortcuts
- `Ctrl + F`: Add file to analyze
- `Ctrl + I`: Import SQL files
- In editor:
  - `Ctrl/⌘ + Enter`: Run the entire script
  - `Ctrl/⌘ + Shift + Enter`: Run the query under the cursor
  - `Ctrl/⌘ + I`: Open AI assistant for SQL generation and error fixes

## 🏷️ Tagged Releases

The official [hosted version](https://app.pondpilot.io/) of PondPilot and the latest tag for our [Docker image](https://ghcr.io/pondpilot/pondpilot) are continuously updated based on the `main` branch. However, we occasionally tag releases to mark significant milestones. You can read the draft release notes for the upcoming tagged version and all released versions on the [release page](https://github.com/pondpilot/pondpilot/releases) or in the [CHANGELOG](CHANGELOG.md).

## 🤝 Contributing

We welcome contributions from the community! Here's how to get started:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🛠️ Development

### Tech Stack

- React 19 with TypeScript
- Mantine UI components
- Tailwind CSS for styling
- DuckDB-WASM for data processing
- Monaco Editor for SQL editing
- FlowScope for SQL analysis (completions, folding, symbols)
- Recharts for data visualization
- ReactFlow for schema diagrams
- Vite for building

### Available Scripts

- `yarn dev` - Start development server
- `yarn build` - Build production version
- `yarn test` - Run Playwright tests
- `yarn preview` - Locally preview production build
- `yarn typecheck` - Check TypeScript types
- `yarn lint` - Run ESLint and Stylelint
- `yarn lint:fix` - Fix ESLint and Stylelint issues
- `yarn prettier` - Check formatting
- `yarn prettier:write` - Format code

## 📜 License

PondPilot is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.

This means you're free to use, modify, and distribute the software, but if you make changes and provide the software as a service over a network, you must make your source code available to users of that service.

## 🙏 Acknowledgments

- Built with [DuckDB-WASM](https://github.com/duckdb/duckdb-wasm) — the powerful SQL database that runs in your browser
- SQL editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- SQL analysis by [FlowScope](https://github.com/pondpilot/flowscope)
- UI components by [Mantine](https://mantine.dev/)
- Charts by [Recharts](https://recharts.org/)
- Schema diagrams by [ReactFlow](https://reactflow.dev/)

---

<p align="center">
  <a href="https://app.pondpilot.io">app.pondpilot.io</a> •
  <a href="https://github.com/pondpilot/pondpilot">GitHub</a> •
</p>
