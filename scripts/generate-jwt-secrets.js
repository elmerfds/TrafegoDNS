#!/usr/bin/env node

/**
 * JWT Secret Generator Script
 * 
 * This script generates secure random tokens for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
 * and displays instructions for using them in the environment.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate secure random strings for JWT secrets
const generateSecret = () => {
  return crypto.randomBytes(64).toString('hex');
};

const accessSecret = generateSecret();
const refreshSecret = generateSecret();

// Create environment file content
const envFileContent = `# TrafegoDNS JWT Secrets
# Generated on ${new Date().toISOString()}
# Add these to your environment or .env file

# JWT Access Token Secret - Used for API authentication
JWT_ACCESS_SECRET=${accessSecret}

# JWT Refresh Token Secret - Used for refresh token generation
JWT_REFRESH_SECRET=${refreshSecret}
`;

console.log('\n🔑 Generated JWT Secrets\n');
console.log(envFileContent);

// Save to jwt-secrets.env file in the same directory as this script
const envFilePath = path.join(__dirname, 'jwt-secrets.env');
fs.writeFileSync(envFilePath, envFileContent);

console.log(`\n✅ Secrets saved to: ${envFilePath}`);
console.log('\nInstructions:');
console.log('1. Add these environment variables to your environment');
console.log('2. Or, when using Docker, add them to your docker-compose.yml:');
console.log('   ```');
console.log('   environment:');
console.log('     - JWT_ACCESS_SECRET=<access_secret>');
console.log('     - JWT_REFRESH_SECRET=<refresh_secret>');
console.log('   ```');
console.log('\n3. Or, reference the file in your docker-compose.yml:');
console.log('   ```');
console.log('   env_file:');
console.log('     - ./scripts/jwt-secrets.env');
console.log('   ```');
console.log('\n⚠️ IMPORTANT: Keep these secrets secure and do not commit them to version control!\n');