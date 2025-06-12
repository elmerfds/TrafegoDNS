# System Status Module

This module provides a modern, space-efficient system for displaying system alerts and notifications.

## Components

### SystemStatusIndicator
- **Location**: Header toolbar
- **Purpose**: Compact status indicator with dropdown
- **Features**:
  - Green checkmark: All systems normal
  - Orange warning triangle: Warnings present
  - Red alert circle: Critical issues
  - Badge with count for multiple alerts
  - Dropdown with detailed alert list
  - Click to navigate to relevant pages

### SystemToastNotifications
- **Location**: Global overlay
- **Purpose**: Show notifications for new alerts
- **Features**:
  - Auto-appears for new alerts
  - Auto-dismisses after timeout
  - Action buttons for navigation
  - Different durations based on severity

## Hook: useSystemAlerts

Centralized hook for managing system alerts:

```typescript
const { data: alerts } = useSystemAlerts()
const alertCount = useSystemAlertsCount()
const hasCritical = useHasCriticalAlerts()
```

## Alert Types

- **warning**: Orange indicators, standard timeout
- **error**: Red indicators, longer timeout
- **info**: Blue indicators, standard timeout

## Integration

The system automatically monitors:
- Orphaned DNS records
- Future: Port conflicts, service issues, etc.

## Migration from Old System

The old `SystemAlertsWidget` has been replaced with this header-based system for:
- Better space efficiency
- Modern UX patterns
- Non-intrusive notifications
- Always-visible status

## Adding New Alert Types

1. Extend the `useSystemAlerts` hook
2. Add new API calls as needed
3. Alerts automatically appear in both indicator and toasts