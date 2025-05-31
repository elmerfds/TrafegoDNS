# Permission Implementation Guide

This guide shows how to apply the new permission framework throughout the application.

## Backend (API) Examples

### 1. Update Route Files to Use Permission-Based Middleware

Instead of role-based authorization:
```javascript
// OLD approach in dnsRoutes.js
router.post('/', authenticate, authorize(['admin', 'operator']), dnsController.createRecord);
```

Use permission-based authorization:
```javascript
// NEW approach
const { PERMISSIONS } = require('../../../utils/permissions');

router.post('/', authenticate, requirePermission(PERMISSIONS.DNS_CREATE), dnsController.createRecord);
```

### 2. Example: Updating DNS Routes

```javascript
// src/api/v1/routes/dnsRoutes.js
const { authenticate, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../../../utils/permissions');

// View records - any authenticated user with view permission
router.get('/records', authenticate, requirePermission(PERMISSIONS.DNS_VIEW), dnsController.getRecords);

// Create record - requires create permission
router.post('/records', authenticate, requirePermission(PERMISSIONS.DNS_CREATE), dnsController.createRecord);

// Update record - requires update permission
router.put('/records/:id', authenticate, requirePermission(PERMISSIONS.DNS_UPDATE), dnsController.updateRecord);

// Delete record - requires delete permission
router.delete('/records/:id', authenticate, requirePermission(PERMISSIONS.DNS_DELETE), dnsController.deleteRecord);

// Force delete orphaned - requires force delete permission
router.post('/orphaned/force-delete', authenticate, requirePermission(PERMISSIONS.DNS_FORCE_DELETE), dnsController.forceDeleteOrphanedRecords);
```

### 3. Controller-Level Permission Checks

Sometimes you need more granular checks within controllers:

```javascript
// In userController.js
async updateUser(req, res, next) {
  try {
    const { id } = req.params;
    
    // Check if user is updating their own profile or has admin permission
    if (req.user.id !== id && !hasPermission(req.user.role, PERMISSIONS.USER_UPDATE)) {
      throw new ApiError('Insufficient permissions', 403);
    }
    
    // ... update logic
  } catch (error) {
    next(error);
  }
}
```

## Frontend (UI) Examples

### 1. Protecting Routes

```tsx
// In App.tsx
<Route path="settings" element={
  <ProtectedRoute path="/settings">
    <SettingsPage />
  </ProtectedRoute>
} />
```

### 2. Conditional Rendering Based on Permissions

```tsx
// In any component
import { usePermissions } from '@/hooks/usePermissions';

export function SomeComponent() {
  const { canPerformAction, hasPermission, PERMISSIONS } = usePermissions();
  
  return (
    <div>
      {/* Show button only if user can create */}
      {canPerformAction('dns.create') && (
        <Button onClick={handleCreate}>Create Record</Button>
      )}
      
      {/* Using permission constants */}
      {hasPermission(PERMISSIONS.CONFIG_UPDATE) && (
        <SettingsForm />
      )}
    </div>
  );
}
```

### 3. Disabling Actions for Insufficient Permissions

```tsx
// Example: Containers page
export function ContainersPage() {
  const { canPerformAction } = usePermissions();
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <CardTitle>Containers</CardTitle>
          <Button 
            onClick={handleSync}
            disabled={!canPerformAction('container.sync')}
            title={!canPerformAction('container.sync') ? 'You don\'t have permission to sync containers' : ''}
          >
            Sync Containers
          </Button>
        </div>
      </CardHeader>
      {/* ... */}
    </Card>
  );
}
```

### 4. Role-Based UI Variations

```tsx
// Example: Different UI for different roles
export function UserProfile() {
  const { isAdmin, isOperator, isViewer, canEditOwnProfile } = usePermissions();
  
  return (
    <div>
      {isAdmin && (
        <AdminDashboard />
      )}
      
      {isOperator && (
        <OperatorDashboard />
      )}
      
      {isViewer && (
        <ViewerDashboard />
      )}
      
      {canEditOwnProfile(userId) && (
        <EditProfileButton />
      )}
    </div>
  );
}
```

### 5. Navigation Menu Filtering

The Layout component already filters navigation based on permissions:

```tsx
// This is already implemented in Layout.tsx
const filteredNavigation = navigation.filter(item => canAccessPage(item.path));
```

## Complete Example: Updating Hostnames Page

```tsx
// src/web/src/pages/Hostnames.tsx
import { usePermissions } from '@/hooks/usePermissions';

export function HostnamesPage() {
  const { canPerformAction } = usePermissions();
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Managed Hostnames</CardTitle>
          {canPerformAction('hostname.create') && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Hostname
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hostname</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              {(canPerformAction('hostname.edit') || canPerformAction('hostname.delete')) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {hostnames.map(hostname => (
              <TableRow key={hostname.id}>
                <TableCell>{hostname.name}</TableCell>
                <TableCell>{hostname.type}</TableCell>
                <TableCell>{hostname.status}</TableCell>
                {(canPerformAction('hostname.edit') || canPerformAction('hostname.delete')) && (
                  <TableCell>
                    {canPerformAction('hostname.edit') && (
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(hostname)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canPerformAction('hostname.delete') && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(hostname)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

## Testing Different Roles

To test the permission system:

1. Create users with different roles:
   - Admin user: Full access to everything
   - Operator user: Can manage DNS/containers but not users/settings
   - Viewer user: Read-only access

2. Log in as each role and verify:
   - Navigation menu shows only allowed pages
   - Action buttons are hidden/disabled appropriately
   - API calls return 403 for unauthorized actions
   - Users can still update their own profile

## Adding New Permissions

To add a new permission:

1. Add it to `src/utils/permissions.js`:
   ```javascript
   const PERMISSIONS = {
     // ... existing permissions
     NEW_FEATURE_VIEW: 'new_feature:view',
     NEW_FEATURE_CREATE: 'new_feature:create',
   };
   ```

2. Assign it to appropriate roles:
   ```javascript
   const ROLE_PERMISSIONS = {
     admin: [...Object.values(PERMISSIONS)],
     operator: [
       // ... existing permissions
       PERMISSIONS.NEW_FEATURE_VIEW,
       PERMISSIONS.NEW_FEATURE_CREATE,
     ],
     viewer: [
       // ... existing permissions
       PERMISSIONS.NEW_FEATURE_VIEW,
     ]
   };
   ```

3. Update UI actions if needed:
   ```javascript
   const UI_ACTIONS = {
     // ... existing actions
     'new_feature.create': ['admin', 'operator'],
   };
   ```

4. Use in your code as shown in the examples above.