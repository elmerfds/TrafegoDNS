import React, { useState } from 'react'
import { Eye, EyeOff, Key } from 'lucide-react'
import { Input } from './input'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface SecretInputProps {
  id?: string
  value?: string
  placeholder?: string
  className?: string
  onChange?: (value: string) => void
  disabled?: boolean
  hasValue?: boolean
  onReveal?: () => Promise<string | null>
}

export function SecretInput({
  id,
  value = '',
  placeholder = '••••••••••••••••',
  className,
  onChange,
  disabled = false,
  hasValue = false,
  onReveal
}: SecretInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState('')
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)

  const handleToggleVisibility = async () => {
    if (!isVisible && hasValue && !revealedValue && onReveal) {
      // Need to fetch the secret value first
      setIsRevealing(true)
      try {
        const secret = await onReveal()
        setRevealedValue(secret)
        setIsVisible(true)
      } catch (error) {
        console.error('Failed to reveal secret:', error)
        // Still toggle visibility but show placeholder
        setIsVisible(true)
      } finally {
        setIsRevealing(false)
      }
    } else {
      setIsVisible(!isVisible)
    }
  }

  const handleStartEdit = () => {
    setIsEditing(true)
    setLocalValue('')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    onChange?.(newValue)
  }

  const handleBlur = () => {
    if (localValue.trim() === '') {
      setIsEditing(false)
      setLocalValue('')
    }
  }

  const displayValue = () => {
    if (isEditing) {
      return localValue
    }
    if (hasValue && !isVisible) {
      return '••••••••••••••••'
    }
    if (hasValue && isVisible && revealedValue) {
      return revealedValue
    }
    return value
  }

  const inputType = () => {
    if (isEditing || !hasValue) {
      return isVisible ? 'text' : 'password'
    }
    return 'text'
  }

  return (
    <div className="relative">
      <div className="relative">
        <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={inputType()}
          value={displayValue()}
          placeholder={placeholder}
          className={cn('pl-10 pr-20', className)}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          readOnly={hasValue && !isEditing}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
          {hasValue && !isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleStartEdit}
              disabled={disabled}
            >
              <span className="sr-only">Edit secret</span>
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleToggleVisibility}
            disabled={disabled || (!hasValue && !isEditing)}
          >
            <span className="sr-only">
              {isVisible ? 'Hide secret' : 'Show secret'}
            </span>
            {isRevealing ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            ) : isVisible ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
      {hasValue && !isEditing && (
        <p className="text-xs text-muted-foreground mt-1">
          Secret is set. Click edit to change or reveal to view.
        </p>
      )}
      {isEditing && (
        <p className="text-xs text-muted-foreground mt-1">
          Enter new secret value. Leave blank to keep existing value.
        </p>
      )}
    </div>
  )
}