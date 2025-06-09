# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- next-header -->

## [0.3.0] - 2025-06-05

### ✨ Highlights

Today's release brings a lot of big & shiny new features, including two of the most requested ones:

- **AI Assistant**: You can now ask PondPilot to write and fix SQL queries for you! Just add your API key in the settings, and you'll be able to use OpenAI, Anthropic, or any other LLM provider that supports the OpenAI API.
- **Persistent Database**: Now you can create temporary tables, views, and other DuckDB objects that will persist across reloads.

But that's not all! We've also added support for more export formats, added schema browser, enabled file drag and drop, and upgraded DuckDB which unlocked the ability to attach remote DuckDB databases!

We hope you'll enjoy these new features! As always, we are looking forward to your feedback and suggestions.

### 🎯 What's Next

We are already working on the next version, including:

- Improved, unified data source explorer
- AI Assistant improvements
- New data source types

and more!

### 📋 Changelog

#### 🚀 New

- Make app database persistent [#131](https://github.com/pondpilot/pondpilot/pull/131)
- Add httpfs support [#131](https://github.com/pondpilot/pondpilot/pull/131)
- AI Assistant [#151](https://github.com/pondpilot/pondpilot/pull/151)
- Add Schema Browser [#147](https://github.com/pondpilot/pondpilot/pull/147)
- Add TSV, MD, SQL, Excel \& XML export formats [#126](https://github.com/pondpilot/pondpilot/pull/126)
- Enhance Schema Browser with Table Selection and Improved Highlighting [#160](https://github.com/pondpilot/pondpilot/pull/160)
- Add support for CSVs with large data fields and improve error handling [#156](https://github.com/pondpilot/pondpilot/pull/156)
- Enabled file drag and drop [#121](https://github.com/pondpilot/pondpilot/pull/121)
- Use DuckDB built-ins as function tooltips \& auto-complete source [#150](https://github.com/pondpilot/pondpilot/pull/150)
- Add batch close tabs action to spotlight [#145](https://github.com/pondpilot/pondpilot/pull/145)

#### 🐛 Fixed

- Allow ATTACH in scripts and fix CTE display [#131](https://github.com/pondpilot/pondpilot/pull/131)
- Add proper handling of empty XLSX sheets [#140](https://github.com/pondpilot/pondpilot/pull/140)
- Add rename support to all data sources and make sure we restore tabs from non-top-level sources [#128](https://github.com/pondpilot/pondpilot/pull/128)

**Full Changelog**: [v0.2.0...v0.3.0](https://github.com/$OWNER/$REPOSITORY/compare/v0.2.0...v0.3.0)

## [0.2.0] - 2025-05-13

A quick reminder: PondPilot is continuously updated at [app.pondpilot.io](https://app.pondpilot.io), but we occasionally mark major milestones so you can easily discover new features and improvements.

### ✨ Highlights

There have been many improvements since 0.1.0, including a complete rework of how we handle data sources, allowing us to open multi-gigabyte files in milliseconds. Here are some highlights:

- **Improved Performance**: PondPilot is now nearly as fast as the native DuckDB CLI and can open multi-gigabyte files instantly.
- **Script Sharing**: You can now share your scripts with others via a simple URL, making it easy to collaborate with your team or share your work with the community.
- **Automatic Data Refresh on External Changes**: If a local file source is changed outside of PondPilot, the app will now behave like a true desktop application and transparently pick up the changes. _Note: There are still some limitations with this feature, but we are working on it._
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

#### 🚀 New

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

#### 🐛 Fixed

- [UX]: Improved how and when loading state is shown and query cancellation behavior [#132](https://github.com/pondpilot/pondpilot/pull/132)
- [Bug]: Handle strictly reserved `temp` and `system` in `ATTACH` statement [#109](https://github.com/pondpilot/pondpilot/pull/109)
- [UX]: Improved unsupported browser layout and settings pages [#90](https://github.com/pondpilot/pondpilot/pull/90)
- [UX]: Truncate long text in Spotlight [#68](https://github.com/pondpilot/pondpilot/pull/68)

#### 📚 Documentation

- [Feature]: Show onboarding video for first-time users [#99](https://github.com/pondpilot/pondpilot/pull/99)

**Full Changelog**: [v0.1.0...v0.2.0](https://github.com/$OWNER/$REPOSITORY/compare/v0.1.0...v0.2.0)

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
