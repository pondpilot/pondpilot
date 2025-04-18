# PondPilot - Get your data 🦆 in a row

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Latest Release](https://img.shields.io/github/v/release/pondpilot/pondpilot)](https://github.com/pondpilot/pondpilot/releases/latest)

## 🚀 What is PondPilot?

PondPilot is a blazing-fast, lightweight, 100% client-side data exploration tool that helps you analyze local & remote data with zero setup. Powered by DuckDB-Wasm, it runs entirely in your browser - no install, no servers, no cloud uploads, complete privacy. Whether you're a data analyst, scientist, or engineer, PondPilot helps you get your data ducks in a row without the overhead of traditional data tools.

## 💡 Why PondPilot?

**Traditional data tools have major drawbacks:**
- They require complex setup and installation
- They often send your data to remote servers
- They're resource-intensive and can be slow for large datasets
- Many require paid subscriptions or have usage limits

**PondPilot solves these problems by:**
- Running entirely in your browser with zero installation
- Processing all data locally - your data never leaves your device
- Using DuckDB's lightning-fast SQL engine optimized for analytical queries
- Providing the ability to work directly with your files without making copies
- Being completely free and open-source

## 🔍 Features

### 🔒 Privacy & Security
- **100% Client-Side**: All processing happens in your browser - your sensitive data never leaves your device
- **PWA Support**: 📱 Install PondPilot as a Progressive Web App for offline use anywhere
- **Read-only**: ✅ PondPilot doesn't write to your files, guaranteeing data safety and integrity

### ⚡ Performance & Efficiency
- **No data-copy**: 🔄 Unlike similar tools, PondPilot accesses files directly without copying to browser cache - changes outside PondPilot are reflected in real-time
- **Powered by DuckDB**: 🚀 Leverage the lightning-fast SQL engine for analyzing millions of rows in seconds
- **Cross-session persistence**: 💾 All data-handles and queries are automatically saved between sessions

### 🧰 Powerful Analysis Tools
- **Multiple File Formats**: 📊 Support for CSV, Parquet, JSON, XLSX, DuckDB database and more coming soon
- **Interactive SQL Editor**: 💻 Write and execute SQL queries with syntax highlighting, auto-completion, and error detection
- **Data Visualization**: 📈 View, filter, and sort your query results in a responsive interactive table
- **Full-text Schema Explorer**: 🔍 Easily navigate through tables and columns with auto-generated metadata [coming soon]

### 🎨 User Experience
- **Data Export**: 📁 Export your query results to various formats for further analysis
- **Keyboard Shortcuts**: ⌨️ Navigate efficiently with intuitive keyboard shortcuts
- **Dark/Light Mode**: 🌓 Choose the interface that's easiest on your eyes

## 🖥️ Demo

![](https://github.com/user-attachments/assets/a47547ba-3b25-440d-816a-05d47c7d60ec)

## 🚀 Getting Started

### Using the Web App

The easiest way to use PondPilot is through the hosted web app:

1. Visit [https://app.pondpilot.io](https://app.pondpilot.io)
2. Click "Add file" or use keyboard shortcut (Ctrl+F) to load your data
3. Start exploring!

### Browser Requirements

As of today PondPilot only guranteed to work best in Chrome due to the use of File System Access APIs not available in other browsers. Hopefully this will change in the future.

### Running Locally

#### Using Docker

Run PondPilot with a single command:

```bash
docker run -d -p 4173:80 --name pondpilot ghcr.io/pondpilot/pondpilot:latest
```

Visit `http://localhost:4173` in your browser to access the app.

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
- In editor:
  - `Ctrl/⌘ + Enter`: Run the entire script
  - `Ctrl/⌘ + Shift + Enter`: Run the query under the cursor
- `Ctrl + F`: Add file to analyze
- `Ctrl + D`: Add DuckDB file
- `Ctrl + I`: Import SQL files

## 🚀 Roadmap

The goal for PondPilot is to remain lightweight. We strive to quickly reach feature completeness and then accept only security fixes or updates to keep up with DuckDB.

Here is what we are planning before reaching feature completeness:
* LLM-based code suggestions
* Basic statistics & metadata view without the need to run queries (think data distribution, column types, etc.)
* Additional popular local & remote sources support: SQLite, MotherDuck

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

## Similar Projects

DuckDB is awesome, and there are many similar proejcts out there. And there is even more SQL IDE's beyond that. We've been inspired by the following projects:

* [Rill](https://github.com/rilldata/rill)
* [QuackDB](https://github.com/mattf96s/QuackDB)
* [TablePlus](https://tableplus.com)
* [Outerbase Studio](https://github.com/outerbase/studio)
* [harlequin](https://github.com/tconbeer/harlequin)
* [duck-ui](https://github.com/caioricciuti/duck-ui)

And many more!

## 📜 License

PondPilot is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.

This means you're free to use, modify, and distribute the software, but if you make changes and provide the software as a service over a network, you must make your source code available to users of that service.

## 🙏 Acknowledgments

* Built with [DuckDB-WASM](https://github.com/duckdb/duckdb-wasm) - the powerful SQL database that runs in your browser
* UI components by [Mantine](https://mantine.dev/)
* This project incorporates and modifies code related to query editor from [Outerbase Studio](https://github.com/outerbase/studio) which is licensed under the GNU Affero General Public License v3.0.

---

<p align="center">
  <a href="https://app.pondpilot.io">app.pondpilot.io</a> •
  <a href="https://github.com/pondpilot/pondpilot">GitHub</a> •
  <a href="https://t1a.com">Built at T1A with ❤️</a>
</p>
