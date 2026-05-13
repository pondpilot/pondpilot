# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- next-header -->
## ✨ Highlights

This release adds four things: **MotherDuck**, **DuckLake**, **Quack**, and **SQL Linting**.

- **☁️ MotherDuck**: Connect to MotherDuck cloud databases with a service token. The extension loads dynamically — no special build needed. The token is stored in the encrypted secret store and auto-reconnects on reload. COOP/COEP headers are now enabled in production so  is available for the extension.

- **🌊 DuckLake Catalogs**: New DuckLake Catalog data source for browsing remote  catalogs. Paste a URL, the alias auto-derives from the path, and tables appear in the sidebar with schema browsing, spotlight search, and reconnection on reload. Comes with a DuckDB-WASM upgrade to DuckDB v1.5.1, which also fixes the storage version compatibility issue with newer DuckDB files.

- **🦆 Quack Protocol**: Quack Server is now a first-class data source. The token is stored encrypted, databases attach and reconnect on reload, and they work in queries, the data explorer, and comparison flows like a local source.

- **🔍 SQL Linting**: Built-in SQL linting in the editor via FlowScope. A new SQL Linting settings panel lets you toggle rules and filter by severity. In the editor you can disable a rule via the context menu and apply Fix or Fix All through code actions.

## 🎯 What's Next

- More cloud and remote data source integrations
- Expanded lint rule coverage
- Performance work for large remote catalogs

## 📋 Changelog

### 🚀 New

- Add Quack protocol integration [#287](https://github.com/pondpilot/pondpilot/pull/287)
- feat: Add MotherDuck cloud database integration [#278](https://github.com/pondpilot/pondpilot/pull/278)
- Add DuckLake catalog support and upgrade DuckDB-WASM [#284](https://github.com/pondpilot/pondpilot/pull/284)
- Add SQL linting with configurable rules, severity filtering, and autofix [#281](https://github.com/pondpilot/pondpilot/pull/281)

### 🐛 Fixed

- fix: Improve table alignment and theme consistency in UI [#286](https://github.com/pondpilot/pondpilot/pull/286)

**Full Changelog**: [v0.8.0...v0.9.0](https://github.com/pondpilot/pondpilot/compare/v0.8.0...v0.9.0)


## ✨ Highlights

This is the largest PondPilot release to date, with 15 new features and 6 bug fixes. The main additions are interactive chart visualization, a built-in AI assistant, migration to the Monaco code editor, and script version history.

- **📊 Chart View**: Data tabs now include a chart view alongside the table view. Choose from multiple chart types, configure axes and grouping, use small multiples to compare subsets, and export charts as PNG. Useful for getting a quick visual overview before diving into deeper analysis.

- **🤖 Polly AI Assistant**: PondPilot now ships with a built-in AI assistant that works out of the box — no API key required. Ask questions about your data, get SQL suggestions, or explore analysis approaches directly from the sidebar. You can also bring your own API key if preferred; credentials are stored securely using the new encrypted secret store.

- **⚡ Monaco Editor**: The SQL editor has been migrated from CodeMirror to Monaco (the engine behind VS Code). This brings context-aware autocomplete powered by FlowScope SQL analysis, code folding, go-to-definition, rename symbol, hover tooltips, and better performance on large documents.

- **📜 Script Version History**: PondPilot now automatically tracks versions of your SQL scripts on every run, save, and tab close. Browse the full history, preview changes with a diff view, and restore any previous version with one click. All versions are stored locally in IndexedDB.

## 🎯 What's Next

We're continuing to improve the core data exploration experience:

- Enhanced chart capabilities with more chart types and interactivity
- AI assistant improvements and broader LLM provider support
- Additional data format conversions and export options
- Performance optimizations for large-scale remote datasets

## 📋 Changelog

### 🚀 New

- [Feature]: Add chart view for data tabs [#251](https://github.com/pondpilot/pondpilot/pull/251)
- [Feature]: Add Polly AI as built-in AI assistant with demo token authentication [#246](https://github.com/pondpilot/pondpilot/pull/246)
- [Feature]: Migrate Polly AI proxy [#256](https://github.com/pondpilot/pondpilot/pull/256)
- [Feature]: Migrate to Monaco editor [#255](https://github.com/pondpilot/pondpilot/pull/255)
- [Feature]: Script Version History [#159](https://github.com/pondpilot/pondpilot/pull/159)
- [Feature]: Add read_stat extension for SAS, SPSS, and Stata files [#271](https://github.com/pondpilot/pondpilot/pull/271)
- [Feature]: Add Convert To context menu with Parquet export and format registry [#272](https://github.com/pondpilot/pondpilot/pull/272)
- [Feature]: Add encrypted secret store for Iceberg and AI credentials [#228](https://github.com/pondpilot/pondpilot/pull/228)
- [Feature]: Add custom S3 endpoint configuration [#245](https://github.com/pondpilot/pondpilot/pull/245)
- [Feature]: Spotlight LRU [#253](https://github.com/pondpilot/pondpilot/pull/253)
- [Feature]: Add tab takeover for multiple tabs detection [#248](https://github.com/pondpilot/pondpilot/pull/248)
- [Feature]: Add split-view release history to What's New modal [#273](https://github.com/pondpilot/pondpilot/pull/273)
- [UX]: Improve SQL editor completion performance for large documents [#269](https://github.com/pondpilot/pondpilot/pull/269)
- [UX]: Fix AI assistant panel width, alignment, and interactivity [#270](https://github.com/pondpilot/pondpilot/pull/270)
- [UX]: Add 'View all releases' link to WhatsNewModal [#249](https://github.com/pondpilot/pondpilot/pull/249)

### 🐛 Fixed

- [Bug]: Fix Ctrl+C copying table cell instead of editor text [#276](https://github.com/pondpilot/pondpilot/pull/276)
- [Bug]: Fix DataCloneError and React setState-during-render warnings [#268](https://github.com/pondpilot/pondpilot/pull/268)
- [Bug]: Switch SQL splitting to FlowScope AST [#254](https://github.com/pondpilot/pondpilot/pull/254)
- [Bug]: Fix incorrect database name when creating comparison from file source [#243](https://github.com/pondpilot/pondpilot/pull/243)
- [Bug]: Fix incorrect database name when creating comparison from file source [#242](https://github.com/pondpilot/pondpilot/pull/242)
- [Bug]: Fix dbname parsing in proxied ATTACH statement [#238](https://github.com/pondpilot/pondpilot/pull/238)

### 📚 Documentation

- Remove YouTube onboarding video and update README [#279](https://github.com/pondpilot/pondpilot/pull/279)

**Full Changelog**: [v0.7.0...v0.8.0](https://github.com/pondpilot/pondpilot/compare/v0.7.0...v0.8.0)

## ✨ Highlights

This release brings powerful new features that make PondPilot more collaborative, accessible, and robust for working with remote data! The headline features are **data comparison**, **built-in feedback system**, and **seamless remote database access** through intelligent CORS proxy support.

- **📊 PondPilot Compare**: Compare datasets side-by-side with visual highlighting of differences. Perfect for validating data transformations, tracking changes over time, or comparing production vs. staging data. The intuitive interface makes it easy to spot discrepancies at a glance.

- **💬 Built-in Feedback Reporter**: Share your thoughts without leaving the app! The new in-app bug reporter lets you submit feedback, report issues, and request features directly from PondPilot. With smart context capture (browser info, app version, error details), reports include everything needed to quickly address your concerns.

- **🌐 CORS Proxy Support**: Access remote databases and data files without CORS headaches. PondPilot now automatically detects CORS errors and retries through a transparent proxy, making remote S3 buckets, cloud storage, and databases instantly accessible. Just paste the URL and go - PondPilot handles the rest.

- **🚀 Subdirectory Deployment**: Deploy PondPilot alongside other services with configurable base path support. Perfect for organizations running multiple apps under one domain (e.g., ). Includes comprehensive nginx configuration examples and Docker deployment guides.

## 🎯 What's Next

We're continuing to enhance the core data exploration experience:

- Advanced data visualization and chart capabilities
- Enhanced comparison features with drill-down analysis
- Performance optimizations for larger remote datasets
- Additional cloud storage provider integrations

## 📋 Changelog

### 🚀 New

- [Feature]: PondPilot Compare [#231](https://github.com/pondpilot/pondpilot/pull/231)
- [Feature]: Implement a built-in feedback reporter [#224](https://github.com/pondpilot/pondpilot/pull/224)
- [Feature]: Add CORS Proxy Support for Remote Database Access [#222](https://github.com/pondpilot/pondpilot/pull/222)
- [Feature]: Enhance deployment support with subdirectory configuration and update… [#219](https://github.com/pondpilot/pondpilot/pull/219)

### 🐛 Fixed

- [Bug]: Fix comparison page header [#237](https://github.com/pondpilot/pondpilot/pull/237)
- [Bug]: Fix clipboard handling for Safari and Firefox [#226](https://github.com/pondpilot/pondpilot/pull/226)
- [Bug]: Fix S3 rewriter [#225](https://github.com/pondpilot/pondpilot/pull/225)

**Full Changelog**: [v0.6.0...v0.7.0](https://github.com/pondpilot/pondpilot/compare/v0.6.0...v0.7.0)


## ✨ Highlights

This release makes PondPilot more accessible and user-friendly than ever! The biggest news is **full cross-browser support** - you can now use PondPilot in Firefox and Safari, not just Chrome and Edge. We've also added incredibly convenient **clipboard data import** for quick ad-hoc analysis, and improved the overall user experience with better notifications and file exploration.

- **🌐 Universal Browser Support**: PondPilot now works seamlessly across all major browsers including Firefox, Safari, Chrome, and Edge. Non-Chromium browsers get a gracefully degraded experience with session-based file handling and clear compatibility notifications.

- **📋 Clipboard Data Import**: Transform your workflow with instant data import from clipboard. Simply copy CSV or JSON data and paste it directly into PondPilot with configurable header detection for CSV files - perfect for quick ad-hoc analysis.

- **👁️ File Column Preview**: Explore your data more efficiently with Alt+Click (Option+Click on Mac) to expand and view table columns directly in the Files panel without opening each file individually.

- **💬 Enhanced Notifications**: Experience clearer, more actionable error messages that guide you toward solutions instead of just describing problems. Error titles no longer duplicate type information, and copy operations show specific context.

## 🎯 What's Next

We're continuing to focus on making data analysis more intuitive and accessible:

- Enhanced query editor with intelligent suggestions
- Improved data visualization capabilities  
- Performance optimizations for large datasets
- More export format options

## 📋 Changelog

### 🚀 New
- [UX]: Import CSV and JSON data directly from clipboard [#214](https://github.com/pondpilot/pondpilot/pull/214)
- [Feature]: Show columns of File on Files panel [#205](https://github.com/pondpilot/pondpilot/pull/205) 
- [Feature]: Add non-Chromium based browser support [#203](https://github.com/pondpilot/pondpilot/pull/203)

### 🐛 Fixed
- [Bug]: Fix empty database handling to show info instead of error (#158) [#213](https://github.com/pondpilot/pondpilot/pull/213)
- [Bug]: Fix drag-and-drop file upload for non-Chromium browsers [#212](https://github.com/pondpilot/pondpilot/pull/212)

### 💅 Improved
- [UX]: Improve notification messages for better user experience [#216](https://github.com/pondpilot/pondpilot/pull/216)

**Full Changelog**: [v0.5.0...v0.6.0](https://github.com/pondpilot/pondpilot/compare/v0.5.0...v0.6.0)


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
