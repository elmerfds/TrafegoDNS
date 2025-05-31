# orphanedTime.toISOString Error Analysis

## Issue Location
The error occurs in two main locations:

1. In `src/state/actions/orphanedActions.js`, line 36:
```javascript
orphanedSince: orphanedTime ? orphanedTime.toISOString() : null
```

2. In `src/api/v1/controllers/dnsController.js`, around line 561:
```javascript
const formattedTime = typeof orphanedTime === 'string' ? orphanedTime : 
                    orphanedTime ? orphanedTime.toISOString() : null;
```

## Root Cause
The error happens because `orphanedTime` is sometimes not a Date object when `toISOString()` is called on it. The issue likely stems from the SQLite implementation of `getRecordOrphanedTime()`.

### Current Implementation:
In `src/utils/recordTracker/orphanManager.js`:
- The JSON storage implementation correctly returns either a string timestamp or creates a Date object before calling toISOString()
- However, in `src/utils/recordTracker/sqliteManager.js`, the SQLite implementation sometimes returns the raw value without ensuring it's a proper Date object

## Fix Required
The issue needs to be fixed in both locations by ensuring `orphanedTime` is always properly handled before calling `toISOString()`:

1. Fix in `orphanedActions.js`:
```javascript
orphanedSince: orphanedTime ? 
  (typeof orphanedTime === 'string' ? orphanedTime : orphanedTime.toISOString()) 
  : null
```

2. The fix in `dnsController.js` is correct but could be improved:
```javascript
const formattedTime = typeof orphanedTime === 'string' ? orphanedTime : 
                     (orphanedTime instanceof Date) ? orphanedTime.toISOString() : 
                     (orphanedTime && typeof orphanedTime === 'object') ? new Date(orphanedTime).toISOString() :
                     null;
```

3. The core fix in `src/utils/recordTracker/sqliteManager.js` (line 319):
```javascript
return result ? (typeof result === 'string' ? result : (result instanceof Date ? result.toISOString() : new Date(result).toISOString())) : null;
```

This ensures that regardless of what type `orphanedTime` is, we'll either use it as-is if it's a string, convert it to a string if it's a Date, or attempt to create a Date from it before calling toISOString().
EOL < /dev/null
