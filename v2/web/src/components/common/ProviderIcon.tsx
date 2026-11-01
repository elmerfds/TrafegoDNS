/**
 * Provider Icons Component
 * Displays appropriate brand icons for DNS providers
 */

interface ProviderIconProps {
  type: string;
  className?: string;
}

export function ProviderIcon({ type, className = 'w-5 h-5' }: ProviderIconProps) {
  switch (type.toLowerCase()) {
    case 'cloudflare':
      return <CloudflareIcon className={className} />;
    case 'digitalocean':
      return <DigitalOceanIcon className={className} />;
    case 'route53':
      return <Route53Icon className={className} />;
    case 'technitium':
      return <TechnitiumIcon className={className} />;
    case 'adguard':
      return <AdGuardIcon className={className} />;
    case 'pihole':
      return <PiHoleIcon className={className} />;
    case 'rfc2136':
      return <RFC2136Icon className={className} />;
    default:
      return <DefaultProviderIcon className={className} />;
  }
}

function CloudflareIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.17 21.5H9.76c-.25 0-.47-.15-.56-.38-.09-.23-.04-.49.14-.67l3.66-3.66c.47-.47 1.1-.73 1.77-.73h8.68c.14 0 .27-.06.36-.17.09-.11.12-.25.09-.39-.31-1.17-1.37-1.98-2.58-1.98h-1.08c-.16 0-.31-.08-.4-.21-.09-.13-.11-.3-.05-.45.42-1.07.23-2.31-.52-3.2-.76-.89-1.93-1.32-3.08-1.13-1.15.19-2.11 1.01-2.52 2.13-.07.2-.25.34-.46.36-.21.02-.42-.08-.53-.26-.76-1.24-2.1-2-3.55-2-2.32 0-4.2 1.88-4.2 4.2 0 .34.04.67.12.99.05.21-.02.44-.18.59-.16.15-.39.2-.6.13-.34-.12-.7-.18-1.06-.18-1.73 0-3.14 1.41-3.14 3.14s1.41 3.14 3.14 3.14h16.2c.35 0 .63-.28.63-.63s-.28-.64-.63-.64z"
        fill="#F38020"
      />
      <path
        d="M26.57 14.38c-.08 0-.17.01-.25.02-.14.02-.27-.05-.35-.16-.08-.11-.1-.26-.05-.39.18-.5.27-1.02.27-1.56 0-2.63-2.14-4.77-4.77-4.77-1.67 0-3.21.88-4.07 2.3-.09.15-.26.24-.44.22-.18-.01-.34-.13-.4-.3-.5-1.33-1.78-2.22-3.22-2.22-1.89 0-3.43 1.54-3.43 3.43 0 .14.01.28.03.42.02.17-.05.33-.18.44-.13.11-.31.14-.47.09-.32-.11-.66-.16-1-.16-1.73 0-3.14 1.41-3.14 3.14 0 .35.06.69.17 1.02.06.19 0 .4-.16.53-.16.13-.38.15-.56.05-.54-.3-1.16-.46-1.8-.46C1.41 15.52 0 16.93 0 18.66s1.41 3.14 3.14 3.14h23.43c1.73 0 3.14-1.41 3.14-3.14s-1.41-3.14-3.14-3.14v-1.14z"
        fill="#FAAE40"
      />
    </svg>
  );
}

function DigitalOceanIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 32v-6.04c5.76 0 10.14-5.56 8.04-11.64-0.88-2.52-2.88-4.52-5.4-5.4C12.56 6.82 7 11.2 7 16.96H0.96C0.96 7.6 9.64-0.36 19.4 1.72c5.32 1.12 9.76 5.56 10.88 10.88 2.08 9.76-5.88 18.44-15.24 18.44v0.96H16z"
        fill="#0080FF"
      />
      <path d="M16 25.96H9.96V32H16v-6.04z" fill="#0080FF" />
      <path d="M9.96 30.16H5.04v-4.2h4.92v4.2z" fill="#0080FF" />
      <path d="M5.04 26.96H1.24v-3.8h3.8v3.8z" fill="#0080FF" />
    </svg>
  );
}

function Route53Icon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* AWS Route 53 - Stylized DNS/Route icon in AWS orange */}
      <path
        d="M16 2L4 8v16l12 6 12-6V8L16 2z"
        fill="#8C4FFF"
      />
      <path
        d="M16 2L4 8l12 6 12-6L16 2z"
        fill="#B17DF4"
      />
      <path
        d="M16 14v16l12-6V8l-12 6z"
        fill="#5E1F99"
      />
      <circle cx="16" cy="14" r="3" fill="#fff" />
      <circle cx="10" cy="11" r="2" fill="#fff" opacity="0.7" />
      <circle cx="22" cy="11" r="2" fill="#fff" opacity="0.7" />
      <circle cx="16" cy="22" r="2" fill="#fff" opacity="0.7" />
      <path d="M16 14L10 11M16 14L22 11M16 14V22" stroke="#fff" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function TechnitiumIcon({ className }: { className: string }) {
  return (
    <img
      src="https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/technitium.png"
      alt="Technitium DNS"
      className={className}
    />
  );
}

function AdGuardIcon({ className }: { className: string }) {
  return (
    <img
      src="https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/adguard-home.png"
      alt="AdGuard Home"
      className={className}
    />
  );
}

function PiHoleIcon({ className }: { className: string }) {
  return (
    <img
      src="https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/pi-hole.png"
      alt="Pi-hole"
      className={className}
    />
  );
}

function RFC2136Icon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Globe with dynamic update arrows */}
      <circle cx="16" cy="16" r="12" stroke="#4B8BBE" strokeWidth="2" fill="none" />
      <ellipse cx="16" cy="16" rx="5" ry="12" stroke="#4B8BBE" strokeWidth="1.5" fill="none" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="#4B8BBE" strokeWidth="1.5" />
      <line x1="6" y1="10" x2="26" y2="10" stroke="#4B8BBE" strokeWidth="1" opacity="0.6" />
      <line x1="6" y1="22" x2="26" y2="22" stroke="#4B8BBE" strokeWidth="1" opacity="0.6" />
      {/* Refresh arrow */}
      <path d="M24 8 L28 8 L28 12" stroke="#F4A620" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 8 C26 5 22 3 16 4" stroke="#F4A620" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M8 24 L4 24 L4 20" stroke="#F4A620" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 24 C6 27 10 29 16 28" stroke="#F4A620" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function DefaultProviderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}
