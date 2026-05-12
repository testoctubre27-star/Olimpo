#!/usr/bin/env node
/**
 * OLIMPO — Generador de tokens seguros
 * Ejecuta: node src/scripts/generate-tokens.js
 */

const crypto = require('crypto');

console.log('\n🔐 OLIMPO — Tokens seguros generados\n');
console.log('Copia estos valores en tu .env:\n');
console.log(`JWT_SECRET=${crypto.randomBytes(64).toString('hex')}`);
console.log(`SETUP_TOKEN=${crypto.randomBytes(20).toString('hex')}`);
console.log('\n⚠️  Guarda estos valores de forma segura. No los compartas ni subas a git.\n');
