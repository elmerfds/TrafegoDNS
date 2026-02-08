/**
 * Provider Wizard
 * Multi-step wizard for adding a new DNS provider
 * Step 1: Select provider type (card grid)
 * Step 2: Configure name + credentials
 * Step 3: Test connection + create
 */
import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ArrowLeft, ArrowRight, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { providersApi, type ProviderType, type CreateProviderInput } from '../../api';
import { Modal, ModalFooter, Button, Alert, ProviderIcon } from '../common';
import { ProviderTypeCard } from './ProviderTypeCard';

// ── Provider metadata ────────────────────────────────────────────────────

interface ProviderMeta {
  name: string;
  description: string;
  supportedTypes: string[];
  features: string[];
}

const providerMetadata: Record<ProviderType, ProviderMeta> = {
  cloudflare: {
    name: 'Cloudflare',
    description: 'DNS management with proxy and tunnel support',
    supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
    features: ['Proxy', 'Tunnels', 'Batch'],
  },
  digitalocean: {
    name: 'DigitalOcean',
    description: 'Simple DNS management for your domains',
    supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
    features: [],
  },
  route53: {
    name: 'AWS Route 53',
    description: 'Scalable DNS with hosted zones',
    supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
    features: ['Batch'],
  },
  technitium: {
    name: 'Technitium DNS',
    description: 'Self-hosted authoritative DNS server',
    supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
    features: ['Self-hosted'],
  },
  adguard: {
    name: 'AdGuard Home',
    description: 'Self-hosted DNS with ad blocking',
    supportedTypes: ['A', 'AAAA', 'CNAME'],
    features: ['Self-hosted'],
  },
  pihole: {
    name: 'Pi-hole',
    description: 'Network-wide ad blocking DNS',
    supportedTypes: ['A', 'AAAA', 'CNAME'],
    features: ['Self-hosted'],
  },
  rfc2136: {
    name: 'RFC 2136',
    description: 'Dynamic DNS updates for BIND, PowerDNS, Knot, etc.',
    supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
    features: ['Self-hosted', 'Standard'],
  },
};

// ── Credential field definitions ─────────────────────────────────────────

interface CredentialField {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

const providerFields: Record<ProviderType, CredentialField[]> = {
  cloudflare: [
    { key: 'apiToken', label: 'API Token', required: true, hint: 'Create a token with DNS:Edit permission at dash.cloudflare.com > My Profile > API Tokens' },
    { key: 'zoneName', label: 'Zone Name', placeholder: 'example.com', required: true, hint: 'Your domain name managed by Cloudflare' },
    { key: 'zoneId', label: 'Zone ID', hint: 'Optional. Found on the domain overview page in Cloudflare dashboard' },
    { key: 'accountId', label: 'Account ID', hint: 'Optional. Required for Cloudflare Tunnel support' },
  ],
  digitalocean: [
    { key: 'apiToken', label: 'API Token', required: true, hint: 'Generate at cloud.digitalocean.com > API > Tokens' },
    { key: 'domain', label: 'Domain', placeholder: 'example.com', required: true },
  ],
  route53: [
    { key: 'accessKeyId', label: 'Access Key ID', required: true, hint: 'IAM user credentials with Route 53 permissions' },
    { key: 'secretAccessKey', label: 'Secret Access Key', required: true, type: 'password' },
    { key: 'zoneName', label: 'Zone Name', placeholder: 'example.com', required: true },
    { key: 'hostedZoneId', label: 'Hosted Zone ID', hint: 'Optional. Will be auto-detected from zone name if not provided' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1', hint: 'AWS region for API calls' },
  ],
  technitium: [
    { key: 'url', label: 'Server URL', placeholder: 'http://technitium:5380', required: true },
    { key: 'zone', label: 'Zone', placeholder: 'example.com', required: true },
    { key: 'apiToken', label: 'API Token', required: true, hint: 'Found in Technitium admin panel under Administration' },
  ],
  adguard: [
    { key: 'url', label: 'Server URL', placeholder: 'http://adguard:80', required: true },
    { key: 'username', label: 'Username', placeholder: 'admin', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'domain', label: 'Domain Filter', placeholder: 'example.com', hint: 'Optional. Only manage records matching this domain' },
  ],
  pihole: [
    { key: 'url', label: 'Server URL', placeholder: 'http://pihole:80', required: true },
    { key: 'password', label: 'Web Password', type: 'password', required: true },
    { key: 'domain', label: 'Domain Filter', placeholder: 'example.com', hint: 'Optional. Only manage records matching this domain' },
  ],
  rfc2136: [
    { key: 'server', label: 'DNS Server', placeholder: '192.168.1.1 or ns1.example.com', required: true, hint: 'IP or hostname of your authoritative DNS server' },
    { key: 'port', label: 'Port', placeholder: '53', hint: 'DNS port (default: 53)' },
    { key: 'zone', label: 'Zone', placeholder: 'example.com', required: true, hint: 'The DNS zone to manage' },
    { key: 'keyName', label: 'TSIG Key Name', placeholder: 'tsig-key', hint: 'Name of the TSIG key for authentication' },
    { key: 'keyAlgorithm', label: 'TSIG Algorithm', placeholder: 'hmac-sha256', hint: 'Algorithm: hmac-sha256, hmac-sha512, hmac-sha1, or hmac-md5' },
    { key: 'keySecret', label: 'TSIG Secret', type: 'password', hint: 'Base64-encoded TSIG secret. Generate with: tsig-keygen -a hmac-sha256 keyname' },
  ],
};

const providerOrder: ProviderType[] = ['cloudflare', 'digitalocean', 'route53', 'technitium', 'rfc2136', 'adguard', 'pihole'];

// ── Step Indicator ───────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: 'Select Provider' },
    { num: 2, label: 'Configure' },
    { num: 3, label: 'Test & Create' },
  ];

  return (
    <div className="flex items-center justify-center mb-6">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          {/* Circle */}
          <div className="flex flex-col items-center">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${step.num < currentStep
                  ? 'bg-primary-600 text-white'
                  : step.num === currentStep
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }
              `}
            >
              {step.num < currentStep ? (
                <Check className="w-4 h-4" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={`
                text-[11px] mt-1.5 whitespace-nowrap
                ${step.num <= currentStep
                  ? 'text-primary-600 dark:text-primary-400 font-medium'
                  : 'text-gray-400 dark:text-gray-500'
                }
              `}
            >
              {step.label}
            </span>
          </div>

          {/* Connecting line */}
          {i < steps.length - 1 && (
            <div
              className={`
                w-16 sm:w-24 h-0.5 mx-2 mb-5 transition-colors
                ${step.num < currentStep
                  ? 'bg-primary-600'
                  : 'bg-gray-200 dark:bg-gray-700'
                }
              `}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Provider Wizard ──────────────────────────────────────────────────────

interface ProviderWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderWizard({ isOpen, onClose }: ProviderWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<ProviderType | null>(null);
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [hasTestedOnStep3, setHasTestedOnStep3] = useState(false);

  // Reset everything when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedType(null);
      setName('');
      setCredentials({});
      setIsDefault(false);
      setError(null);
      setTestResult(null);
      setHasTestedOnStep3(false);
    }
  }, [isOpen]);

  // Build the full provider input
  const buildProviderInput = useCallback((): CreateProviderInput => {
    let creds = { ...credentials };
    if (selectedType === 'technitium') {
      creds = { ...creds, authMethod: 'token' };
    }
    return {
      name,
      type: selectedType!,
      credentials: creds,
      isDefault,
      enabled: true,
    };
  }, [name, selectedType, credentials, isDefault]);

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (data: CreateProviderInput) => providersApi.testProviderCredentials(data),
    onSuccess: (result) => {
      setTestResult(result);
      setError(null);
    },
    onError: (err) => {
      setTestResult({ connected: false, message: err instanceof Error ? err.message : 'Connection test failed' });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateProviderInput) => providersApi.createProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create provider');
    },
  });

  // Auto-test when entering step 3
  useEffect(() => {
    if (step === 3 && !hasTestedOnStep3 && selectedType) {
      setHasTestedOnStep3(true);
      setTestResult(null);
      testMutation.mutate(buildProviderInput());
    }
  }, [step, hasTestedOnStep3, selectedType]);

  // ── Step navigation ──────────────────────────────────────────────────

  const handleSelectType = (type: ProviderType) => {
    if (selectedType !== type) {
      setSelectedType(type);
      setCredentials({});
      // Auto-populate name
      setName(`My ${providerMetadata[type].name}`);
    }
  };

  const handleNext = () => {
    setError(null);

    if (step === 1) {
      if (!selectedType) {
        setError('Please select a provider type');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      // Validate required fields
      if (!name.trim()) {
        setError('Provider name is required');
        return;
      }
      const fields = providerFields[selectedType!];
      for (const field of fields) {
        if (field.required && !credentials[field.key]?.trim()) {
          setError(`${field.label} is required`);
          return;
        }
      }
      setHasTestedOnStep3(false);
      setTestResult(null);
      setStep(3);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleRetryTest = () => {
    setTestResult(null);
    testMutation.mutate(buildProviderInput());
  };

  const handleCreate = () => {
    createMutation.mutate(buildProviderInput());
  };

  // ── Modal title ──────────────────────────────────────────────────────

  const getTitle = () => {
    if (step === 1) return 'Add DNS Provider';
    if (step === 2 && selectedType) {
      return `Configure ${providerMetadata[selectedType].name}`;
    }
    return 'Test Connection';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()} size="2xl">
      <StepIndicator currentStep={step} />

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 1: Select Provider */}
      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {providerOrder.map((type) => {
            const meta = providerMetadata[type];
            return (
              <ProviderTypeCard
                key={type}
                type={type}
                name={meta.name}
                description={meta.description}
                supportedTypes={meta.supportedTypes}
                features={meta.features}
                selected={selectedType === type}
                onClick={() => handleSelectType(type)}
              />
            );
          })}
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 2 && selectedType && (
        <div className="space-y-4">
          {/* Provider badge */}
          <div className="flex items-center space-x-2 pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
            <ProviderIcon type={selectedType} className="w-6 h-6" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {providerMetadata[selectedType].name}
            </span>
          </div>

          {/* Name field */}
          <div>
            <label className="label">Provider Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`My ${providerMetadata[selectedType].name}`}
            />
          </div>

          {/* Credential fields */}
          {providerFields[selectedType].map((field) => (
            <div key={field.key}>
              <label className="label">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type={field.type ?? 'text'}
                className="input mt-1"
                placeholder={field.placeholder}
                value={credentials[field.key] ?? ''}
                onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
              />
              {field.hint && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.hint}</p>
              )}
            </div>
          ))}

          {/* Default checkbox */}
          <div className="flex items-center pt-1">
            <input
              type="checkbox"
              id="wizard-isDefault"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <label htmlFor="wizard-isDefault" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Set as default provider
            </label>
          </div>
        </div>
      )}

      {/* Step 3: Test & Create */}
      {step === 3 && selectedType && (
        <div className="flex flex-col items-center py-6 space-y-4">
          {/* Testing in progress */}
          {testMutation.isPending && !testResult && (
            <>
              <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Testing connection to {providerMetadata[selectedType].name}...</p>
            </>
          )}

          {/* Test succeeded */}
          {testResult?.connected && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <div className="text-center">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Connected Successfully</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{testResult.message}</p>
              </div>
            </>
          )}

          {/* Test failed */}
          {testResult && !testResult.connected && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <div className="text-center">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Connection Failed</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{testResult.message}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleRetryTest}
                isLoading={testMutation.isPending}
              >
                Retry Test
              </Button>
            </>
          )}

          {/* Summary */}
          {testResult && (
            <div className="w-full mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Provider</span>
                <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <ProviderIcon type={selectedType} className="w-4 h-4" />
                  {name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Type</span>
                <span className="font-medium text-gray-900 dark:text-white">{providerMetadata[selectedType].name}</span>
              </div>
              {isDefault && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Default</span>
                  <span className="font-medium text-primary-600 dark:text-primary-400">Yes</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <ModalFooter>
        {step === 1 && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleNext}
              disabled={!selectedType}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <Button
              variant="secondary"
              onClick={handleBack}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <Button
              variant="secondary"
              onClick={handleBack}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createMutation.isPending}
              disabled={testMutation.isPending}
              variant={testResult?.connected ? 'primary' : 'secondary'}
            >
              Create Provider
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
