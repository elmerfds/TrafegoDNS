/**
 * Alert Component
 */
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
}

const variantStyles: Record<AlertVariant, { bg: string; icon: React.ElementType; iconColor: string }> = {
  info: { bg: 'bg-blue-50', icon: Info, iconColor: 'text-blue-400' },
  success: { bg: 'bg-green-50', icon: CheckCircle, iconColor: 'text-green-400' },
  warning: { bg: 'bg-yellow-50', icon: AlertCircle, iconColor: 'text-yellow-400' },
  error: { bg: 'bg-red-50', icon: XCircle, iconColor: 'text-red-400' },
};

export function Alert({ variant = 'info', title, children, onClose }: AlertProps) {
  const { bg, icon: Icon, iconColor } = variantStyles[variant];

  return (
    <div className={`rounded-md p-4 ${bg}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          )}
          <div className="text-sm text-gray-700">{children}</div>
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className="inline-flex rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
