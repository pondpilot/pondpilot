# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- next-header --> 
## [0.2.0] - 2025-05-13

A quick reminder: PondPilot is continuously updated at [app.pondpilot.io](https://app.pondpilot.io), but we occasionally mark major milestones so you can easily discover new features and improvements.

### ✨ Highlights

There have been many improvements since 0.1.0, including a complete rework of how we handle data sources, allowing us to open multi-gigabyte files in milliseconds. Here are some highlights:

- **Improved Performance**: PondPilot is now nearly as fast as the native DuckDB CLI and can open multi-gigabyte files instantly.
- **Script Sharing**: You can now share your scripts with others via a simple URL, making it easy to collaborate with your team or share your work with the community.
- **Automatic Data Refresh on External Changes**: If a local file source is changed outside of PondPilot, the app will now behave like a true desktop application and transparently pick up the changes. *Note: There are still some limitations with this feature, but we are working on it.*
- **Folder Support**: You can now add entire folders to PondPilot, and it will automatically include all the files inside.
- **Full Support for Multi-Tab State**: The app now feels like a true IDE, with tabs remembering their state between reloads and when switching.
- **Query Editor Improvements**: The query editor now provides better auto-completion suggestions, including automatic quoting. Finally, you can safely and easily work with your favorite file called `my 🦆.csv`!

### 🎯 What's Next

We are working on a new version. Here are some features you can expect:

- **Query Editor Improvements**: We know the current query editor is far from perfect; we are working on bringing a full VS Code experience to PondPilot.
- **Persistent Database**: Soon, PondPilot will persist the managed internal DuckDB database across reloads, so you'll be able to maintain not just scripts and sources, but also temporary tables and other DuckDB objects.
- **New Export Formats**: More export formats are coming, including JSON, Parquet, and DuckDB.
- **New (Remote) Data Sources**: Multiple new data sources are coming, including remote DuckDB databases.

### 📋 Changelog

### 🚀 New

- [UX]: Add DesktopOnly component for desktop view restriction [#134](https://github.com/pondpilot/pondpilot/pull/134)
- [UX]: Add Release Notes modal and new version pop-up notification [#137](https://github.com/pondpilot/pondpilot/pull/137)
- [UX]: Add auto-save alert on script save action [#135](https://github.com/pondpilot/pondpilot/pull/135)
- [UX]: Add a close button on the settings page, improve query editor focus, and make minor UI tweaks [#122](https://github.com/pondpilot/pondpilot/pull/122)
- [Feature]: Allow sharing and importing scripts via URLs [#111](https://github.com/pondpilot/pondpilot/pull/111)
- [Feature]: Show onboarding video for first-time users [#99](https://github.com/pondpilot/pondpilot/pull/99)
- [Feature]: Add automatic retry when a file source is moved or changed [#107](https://github.com/pondpilot/pondpilot/pull/107)
- [UX]: Do not show pagination when only one data page exists [#87](https://github.com/pondpilot/pondpilot/pull/87)
- [UX]: Show a helpful "Browser not supported" screen instead of a notification [#71](https://github.com/pondpilot/pondpilot/pull/71)
- [UX]: Truncate long text in Spotlight [#68](https://github.com/pondpilot/pondpilot/pull/68)
- [UX]: Update issue link in SpotlightMenu component [#67](https://github.com/pondpilot/pondpilot/pull/67)

### 🐛 Fixed

- [UX]: Improved how and when loading state is shown and query cancellation behavior [#132](https://github.com/pondpilot/pondpilot/pull/132)
- [Bug]: Handle strictly reserved `temp` and `system` in `ATTACH` statement [#109](https://github.com/pondpilot/pondpilot/pull/109)
- [UX]: Improved unsupported browser layout and settings pages [#90](https://github.com/pondpilot/pondpilot/pull/90)
- [UX]: Truncate long text in Spotlight [#68](https://github.com/pondpilot/pondpilot/pull/68)

### 📚 Documentation

- [Feature]: Show onboarding video for first-time users [#99](https://github.com/pondpilot/pondpilot/pull/99)

**Full Changelog**: https://github.com/pondpilot/pondpilot/compare/v0.1.0...v0.2.0

## 🦆 PondPilot v0.1.0 Release Notes 🦆

We are thrilled to announce the first tagged release of PondPilot! 🎉 PondPilot is your new best friend for data exploration, running entirely in your browser with no setup required. Here's what you can expect in this quacktastic release:

### Major Features

- **100% Client-Side**: All processing happens in your browser - no data ever leaves your device. 🛡️
- **PWA Support**: Install PondPilot as a Progressive Web App for offline use. 📱
- **No Data-Copy**: Possibly the first browser-based tool to access files directly without copying them into the browser cache. 🔄
- **Powered by DuckDB**: Leverage the powerful SQL engine for fast analysis of large datasets. 🚀
- **Interactive SQL Editor**: Write and execute SQL queries with syntax highlighting and auto-completion. ✍️

And more! Check out the full list of features in our [README](https://github.com/pondpilot/pondpilot#-features).

### What's Next?

Our goal is to keep PondPilot lightweight and feature-complete. We're planning to add:
- LLM-based code suggestions 🤖
- Basic statistics & metadata view without running queries 📈
- Support for additional popular local & remote sources: XLSX, SQLite, MotherDuck 📦

### 🏷️ Tagged Releases

We use tagged releases to mark significant milestones in PondPilot's development and notify you about new features. The hosted version of PondPilot at [app.pondpilot.io](https://app.pondpilot.io) is continuously updated with the latest changes, but you can always run a specific version via [Docker](https://github.com/pondpilot/pondpilot/blob/main/README.md#Using-Docker).

Thank you for joining us on this journey! Dive into PondPilot and get your data 🦆 in a row!

Happy exploring! 🦆✨

---

Visit [app.pondpilot.io](https://app.pondpilot.io) to get started!

## [0.1.0-rc.1] - 09.12.2024

### Added
- Internal pre-release
