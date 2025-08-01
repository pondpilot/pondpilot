# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- next-header -->
## ✨ Highlights

This release brings significant improvements to the SQL editing experience and data source management that make PondPilot more powerful and user-friendly:

- **🎨 SQL Formatter with Editor Customization**: Transform your SQL editing experience with comprehensive formatting capabilities, including keyboard shortcuts (Ctrl/Cmd+Shift+F), customizable font sizes, font weights, and auto-format options. The new formatting system uses DuckDB dialect support to ensure your queries look clean and professional.

- **🔌 Streamlined Datasource Wizard**: Adding remote databases is now easier than ever with our new guided wizard. The redesigned interface includes connection testing, improved error handling, and a responsive design that works seamlessly across desktop and mobile devices.

- **📤 One-Click Script Export**: Quickly save and share your work with the new 'Export script' option in the query context menu. Download individual SQL scripts as .sql files directly from the script explorer, making it simple to manage and backup your queries.

## 🎯 What's Next

We're continuing to enhance the core editing and data management experience:

- Additional SQL editor improvements and code intelligence features
- Extended data source support for more database types
- Enhanced export capabilities with multiple file formats
- Further UI refinements based on user feedback

## 📋 Changelog

### 🚀 New

- [Feature]: SQL Formatter with editor customization options [#189](https://github.com/pondpilot/pondpilot/pull/189)
- [Feature]: Add datasource wizard with improved UX and connection testing [#186](https://github.com/pondpilot/pondpilot/pull/186)
- [UX]: Add 'Export script' option to query context menu in script explorer [#196](https://github.com/pondpilot/pondpilot/pull/196)

### 🐛 Fixed

- [Bug]: Navbar accordion UI issues - improved animations, spacing, and layout consistency [#200](https://github.com/pondpilot/pondpilot/pull/200)
- [Bug]: Replace useMantineColorScheme with useColorScheme for proper auto theme detection [#195](https://github.com/pondpilot/pondpilot/pull/195)

**Full Changelog**: [v0.4.0...v0.5.0](https://github.com/pondpilot/pondpilot/compare/v0.4.0...v0.5.0)


## ✨ Highlights

Today's release brings major productivity improvements that make working with your data more intuitive and efficient:

- **@-mentions for Smart Context**: You can now mention datasets, queries, and scripts directly in your AI prompts by typing followed by the object name. The AI assistant gets full context about the objects you're referencing, leading to more accurate SQL suggestions and better error fixes.
- **Unified Explorer Experience**: We've completely redesigned the file and database explorers into a single, cohesive accordion-style interface. Now you can see databases within folders and navigate file systems and database schemas seamlessly in one place.

But that's not all! We've also enhanced autocomplete with Tab key support, improved the dark theme with better component consistency, streamlined export options, and fixed several important stability issues including schema synchronization and connection pool management.

We hope you'll enjoy these productivity-focused improvements! As always, we are looking forward to your feedback and suggestions.

## 🎯 What's Next

We are already working on the next version, including:

- Enhanced data source capabilities and better file handling
- AI Assistant stability improvements and new features
- UI refinements and improved offline functionality

and more!

## 📋 Changelog

### 🚀 New

- Show only relevant Quick Filters in the data explorer [#173](https://github.com/pondpilot/pondpilot/pull/173)
- Enable autocomplete with tab [#179](https://github.com/pondpilot/pondpilot/pull/179)
- Add @-mentions for datasets and queries and prompt history [#166](https://github.com/pondpilot/pondpilot/pull/166)
- Fix dark theme components issues [#170](https://github.com/pondpilot/pondpilot/pull/170)
- File and database Explorer unification [#163](https://github.com/pondpilot/pondpilot/pull/163)
- Remove quote and escape chars options from CSV and TSV export components [#169](https://github.com/pondpilot/pondpilot/pull/169)

### 🐛 Fixed

- Fix schema syncronization issue after file change [#178](https://github.com/pondpilot/pondpilot/pull/178)
- Fixing regression in connection pool management [#188](https://github.com/pondpilot/pondpilot/pull/188)
- Clean-up error context if AI fix was applied [#164](https://github.com/pondpilot/pondpilot/pull/164)

**Full Changelog**: [v0.3.0...v0.4.0](https://github.com/pondpilot/pondpilot/compare/v0.3.0...v0.4.0)

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

**Full Changelog**: [v0.2.0...v0.3.0](https://github.com/pondpilot/pondpilot/compare/v0.2.0...v0.3.0)

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

**Full Changelog**: [v0.1.0...v0.2.0](https://github.com/pondpilot/pondpilot/compare/v0.1.0...v0.2.0)

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
