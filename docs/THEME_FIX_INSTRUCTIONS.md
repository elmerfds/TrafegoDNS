# Theme System Fix Instructions

## Overview
I've identified and fixed the issues with the theme system. Here's what needs to be done:

## Issue 1: Missing Database Column ✅ Fixed
The `theme_preference` column was missing from the users table.

**Solution:** Run the database fix script I created:
```bash
# From your host machine (outside container)
node scripts/add-theme-preference-column.js
```

Or if running inside the container:
```bash
# Inside the container
cd /app
node scripts/add-theme-preference-column.js
```

## Issue 2: Crypto Encryption Error ✅ Already Fixed
The error about `crypto.createCipherGCM` was from an old version. The current code already uses the correct `crypto.createCipheriv` method.

## Issue 3: CSS Theme Classes Not Applying ✅ Fixed
The theme accent colors weren't changing because of CSS specificity issues.

**Changes made:**
1. Changed CSS selectors from `:root.theme-gold` to `.theme-gold` 
2. Added theme overrides outside of `@layer` directives for maximum specificity
3. Fixed dark/light mode theme combinations

## Steps to Apply All Fixes

1. **Stop TrafegoDNS container**
   ```bash
   docker-compose down
   ```

2. **Run the database fix script**
   ```bash
   # Make sure you're in the TrafegoDNS directory
   node scripts/add-theme-preference-column.js
   ```

3. **Rebuild the container** (to include CSS changes)
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

4. **Clear browser cache**
   - Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
   - Or open Developer Tools > Application > Clear Storage

## Testing the Theme System

1. Go to Settings page
2. You should see the "Accent Color" section with 4 theme options:
   - Teal (default)
   - Gold Classic
   - Blue
   - Purple

3. Click on each theme - you should see:
   - Primary button colors change
   - Accent colors throughout the UI change
   - Link hover states change
   - The theme preference saves to database (for logged-in users)

## Troubleshooting

If themes still don't work after following these steps:

1. **Check browser console** for any errors
2. **Verify CSS is loaded** - In Developer Tools, search for `.theme-gold` in the CSS
3. **Check HTML classes** - The `<html>` element should have classes like `theme-gold` when gold theme is selected
4. **Database check** - After selecting a theme, check if it's saved:
   ```sql
   SELECT username, theme_preference FROM users;
   ```

## What Each Theme Looks Like

- **Teal (Default)**: Modern teal/cyan accents, clean and professional
- **Gold Classic**: The original TrafegoDNS amber/gold theme
- **Blue**: Professional blue theme for corporate environments  
- **Purple**: Creative violet theme for a modern look

The theme system now properly:
- Saves preferences to database for logged-in users
- Falls back to localStorage for guests
- Syncs across devices when logged in
- Works with both light and dark modes