# Contributing to PondPilot

Thank you for your interest in contributing to PondPilot! This document provides guidelines for contributions.

## Code of Conduct

By participating, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/pondpilot/pondpilot/issues)
2. If not, create a new issue with a descriptive title and clear steps to reproduce

### Suggesting Features

1. Open a new issue describing the feature and its potential benefits
2. Discuss with maintainers before implementing significant changes

### Development Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests and ensure code quality: `npm run lint && npm run typecheck`
5. Commit with a descriptive message
6. Push to your fork: `git push origin feature/my-feature`
7. Submit a pull request

### Pull Request Guidelines

- Follow the repository's code style
- Include tests for new features
- Update documentation if necessary
- Keep PRs focused on a single change

## Project Structure

The PondPilot source code is organized as follows:

### Top-level Source Folders

- `public/` - Static assets directly served without bundling, including the favicon, and other files accessible via direct URL
- `src/assets/` - Static assets like images, icons, and SVGs
- `src/components/` - Reusable, generic UI components used throughout the application. A rule of thumb: if a component could have come from npm, it should be in this folder. I.e. it should not be tied to PondPilot specifics.
- `src/models/` - TypeScript interfaces, types, data models and application-wide constants and configuration values. No business logic should be here, instead, it should be in the `src/controllers/` or specific feature-compnent in `src/features/` folder.
- `src/controllers/` - Business logic for handling operations (file system, SQL scripts, tabs). Think a typical MVC controller.
- `src/features/` - PondPilot-specific components that implement major functionality, but not a top-level page.
- `src/hooks/` - Custom React hooks (e.g., `use-add-local-files-folders.tsx`) - similar principle as `src/components/` - generic, reusable hooks that could have been used in any project.
- `src/pages/` - Top-level page components (like `main-page.tsx`)
- `src/router/` - Application routing configuration
- `src/store/` - Global state management using Zustand, including memoized selectors (but not setters, these should be in the `src/controllers/` folder)
- `src/theme/` - UI theming and styling configuration
- `src/utils/` - Pure functions and helpers used throughout the application. Subfolder structure should follow the corresponding `src/controllers/` or `src/features/` subfolder structure.

When adding new code, please follow the existing patterns and place files in appropriate directories based on their functionality.

## Styling and Component Guidelines

PondPilot uses a hybrid approach combining Mantine components with Tailwind CSS, with the theme system serving as the single source of truth.

### Key Principles

1. **Theme-first approach**: Use predefined component variants and sizes from `src/theme/theme.ts`
2. **Semantic colors**: Use semantic color tokens (`text-primary`, `background-accent`) instead of hardcoded values
3. **Figma synchronization**: All component variants must exist in the Figma UIKit before being used in code
4. **Avoid**: Using Mantine variants not defined in our UIKit (e.g., `variant="subtle"` if not in theme), hardcoded color values (e.g., `bg-red-500` instead of `bg-background-error`), or overriding base component styles with custom CSS classes unless explicitly required by design

### Usage Guidelines

Use theme-defined variants and semantic colors. Tailwind is acceptable for layout, positioning, and custom effects when specified in design:

```tsx
<Button variant="primary" size="sm">Submit</Button>
<div className="bg-background-primary text-text-primary">Content</div>
```

### Adding New Variants

When adding new component variants, ensure they exist in Figma UIKit first, then update `src/theme/theme.ts`, corresponding CSS modules, and TypeScript definitions.

Thank you for contributing to make PondPilot better!

## Dev Environment Setup

We use a couple of tools, some of which are not strictly necessary, but make development easier. The following is a list of tools you should install to get started:

- [Node.js](https://nodejs.org/en/download/) - JavaScript runtime
- [yarn](https://yarnpkg.com/getting-started/install) - Package manager
  - Note that project uses the corepack approach, so yarn should be installed via corepack, which is bundled with Node.js v16.9.0 and later. Make sure to run `corepack enable` to enable it.
- [prettier](https://prettier.io/) - Code formatter
- [eslint](https://eslint.org/) - Linter
- [typescript](https://www.typescriptlang.org/) - TypeScript compiler
- [DuckDB](https://duckdb.org/) - SQL database engine, used in testing
- [just](https://just.systems/man/en/packages.html) - Task runner (yes, in addition to yarn. Not strictly necessary, but makes life easier)
