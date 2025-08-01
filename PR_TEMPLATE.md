## Description

This PR adds MotherDuck as a new datasource type to PondPilot, enabling users to connect directly to MotherDuck cloud databases without needing to export data or use separate tools.

**Key Features:**

- **New Datasource Type**: MotherDuck databases now appear alongside local files and remote databases in the unified data explorer
- **Token Authentication**: Secure connection using MotherDuck authentication tokens with connection testing
- **Database Discovery**: Automatic discovery and selection of available databases in the user's MotherDuck account
- **UI Integration**: Dedicated MotherDuck section in data explorer with cloud icons and filtering support
- **Connection Management**: Robust connection pooling, error handling, and state persistence

**Technical Implementation:**

- Uses official `@motherduck/wasm-client` v0.6.6 for browser-native connectivity
- Follows existing RemoteDB architectural patterns for consistency
- Added Vite dev server COOP/COEP headers to support SharedArrayBuffer requirements
- Full TypeScript integration with proper type safety throughout

This implementation provides the foundation for querying MotherDuck data directly within PondPilot's interface.

## Related Issues

Fixes #192

## How to Test

1. Start the dev server (`npm run dev` or `yarn dev`)
2. Open the datasource wizard (+ button in data explorer)
3. Select "MotherDuck" option
4. Enter a valid MotherDuck authentication token
5. Click "Test Connection" - should successfully connect
6. Select a database from the dropdown
7. Save the datasource
8. Verify MotherDuck databases appear in data explorer with cloud icons
9. Test filtering by MotherDuck datasource type

## Checklist

- [x] I have added at least one test for the new feature or fixed bug, or this PR does not include any app code changes.
- [ ] I have tested the new version using the auto-generated preview URL.
