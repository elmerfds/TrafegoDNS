import React, { createContext, useContext, useId, useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Form context for managing form state
interface FormContextValue {
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  setFieldError: (name: string, error: string) => void;
  clearFieldError: (name: string) => void;
  setFieldTouched: (name: string) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export const useFormContext = () => {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('Form components must be used within a Form');
  }
  return context;
};

// Form validation types
export type ValidationRule<T = any> = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  custom?: (value: T) => string | null;
};

export interface FormProps {
  children: React.ReactNode;
  onSubmit: (data: FormData) => Promise<void> | void;
  className?: string;
  validation?: Record<string, ValidationRule>;
  defaultValues?: Record<string, any>;
}

export function Form({ 
  children, 
  onSubmit, 
  className = '',
  validation = {},
  defaultValues = {}
}: FormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const setFieldError = useCallback((name: string, error: string) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);

  const clearFieldError = useCallback((name: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  const setFieldTouched = useCallback((name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
  }, []);

  const validateField = (name: string, value: any): string | null => {
    const rules = validation[name];
    if (!rules) return null;

    // Required validation
    if (rules.required && (!value || value.toString().trim() === '')) {
      return `${name} is required`;
    }

    // Skip other validations if value is empty and not required
    if (!value || value.toString().trim() === '') {
      return null;
    }

    // String validations
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        return `${name} must be at least ${rules.minLength} characters`;
      }
      
      if (rules.maxLength && value.length > rules.maxLength) {
        return `${name} must be no more than ${rules.maxLength} characters`;
      }
      
      if (rules.pattern && !rules.pattern.test(value)) {
        return `${name} format is invalid`;
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        return `${name} must be at least ${rules.min}`;
      }
      
      if (rules.max !== undefined && value > rules.max) {
        return `${name} must be no more than ${rules.max}`;
      }
    }

    // Custom validation
    if (rules.custom) {
      return rules.custom(value);
    }

    return null;
  };

  const validateForm = (formData: FormData): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    for (const [name, rules] of Object.entries(validation)) {
      const value = formData.get(name);
      const error = validateField(name, value);
      if (error) {
        newErrors[name] = error;
      }
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGlobalError(null);
    
    const formData = new FormData(e.currentTarget);
    
    // Validate all fields
    const formErrors = validateForm(formData);
    setErrors(formErrors);
    
    // Mark all fields as touched
    const allFields = Object.keys(validation);
    const touchedFields = allFields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setTouched(touchedFields);

    // Don't submit if there are errors
    if (Object.keys(formErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      setGlobalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const contextValue: FormContextValue = {
    errors,
    touched,
    isSubmitting,
    setFieldError,
    clearFieldError,
    setFieldTouched
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
        {globalError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{globalError}</AlertDescription>
          </Alert>
        )}
        {children}
      </form>
    </FormContext.Provider>
  );
}

// Field wrapper component
export interface FieldProps {
  name: string;
  label: string;
  children: React.ReactElement;
  required?: boolean;
  description?: string;
  className?: string;
}

export function Field({ 
  name, 
  label, 
  children, 
  required = false, 
  description,
  className = ''
}: FieldProps) {
  const { errors, touched } = useFormContext();
  const id = useId();
  const hasError = errors[name] && touched[name];

  // Clone children with form props
  const childWithProps = React.cloneElement(children, {
    id,
    name,
    'aria-describedby': description ? `${id}-description` : undefined,
    'aria-invalid': hasError ? 'true' : 'false'
  });

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={id} className={hasError ? 'text-red-600' : ''}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {childWithProps}
      {description && (
        <p id={`${id}-description`} className="text-sm text-gray-600">
          {description}
        </p>
      )}
      {hasError && (
        <p className="text-sm text-red-600">{errors[name]}</p>
      )}
    </div>
  );
}

// Specialized input components
export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void;
}

export function FormInput({ onValueChange, onChange, ...props }: FormInputProps) {
  const { setFieldTouched, clearFieldError } = useFormContext();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Clear error when user starts typing
    if (props.name) {
      clearFieldError(props.name);
    }
    
    // Call external handlers
    onValueChange?.(value);
    onChange?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (props.name) {
      setFieldTouched(props.name);
    }
    props.onBlur?.(e);
  };

  return (
    <Input
      {...props}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

export interface FormSelectProps {
  name?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
}

export function FormSelect({ 
  name, 
  onValueChange, 
  children, 
  placeholder,
  defaultValue,
  ...props 
}: FormSelectProps) {
  const { setFieldTouched, clearFieldError } = useFormContext();

  const handleValueChange = (value: string) => {
    if (name) {
      clearFieldError(name);
      setFieldTouched(name);
    }
    onValueChange?.(value);
  };

  return (
    <>
      <Select 
        name={name}
        onValueChange={handleValueChange}
        defaultValue={defaultValue}
        {...props}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </Select>
      {/* Hidden input for form data */}
      {name && (
        <input type="hidden" name={name} value={defaultValue || ''} />
      )}
    </>
  );
}

// Submit button component
export interface SubmitProps {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  className?: string;
}

export function Submit({ 
  children, 
  loading, 
  disabled = false, 
  variant = 'default',
  className = ''
}: SubmitProps) {
  const { isSubmitting } = useFormContext();
  const isLoading = loading || isSubmitting;

  return (
    <Button
      type="submit"
      disabled={disabled || isLoading}
      variant={variant}
      className={className}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

// Assign sub-components to Form
Form.Field = Field;
Form.Input = FormInput;
Form.Select = FormSelect;
Form.Submit = Submit;