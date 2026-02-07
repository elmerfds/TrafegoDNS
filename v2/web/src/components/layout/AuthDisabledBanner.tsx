/**
 * Non-dismissible banner shown when authentication is disabled
 */
import { ShieldOff } from 'lucide-react';
import { useAuthStore } from '../../stores';

export function AuthDisabledBanner() {
  const authMode = useAuthStore((s) => s.authMode);

  if (authMode !== 'none') return null;

  return (
    <div className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-sm z-50">
      <ShieldOff className="w-4 h-4 flex-shrink-0" />
      <span>
        Authentication is disabled. All users have full admin access.
        Set <code className="bg-amber-600 dark:bg-amber-700 px-1 py-0.5 rounded text-xs font-mono">AUTH_DISABLED=false</code> to enable.
      </span>
    </div>
  );
}
