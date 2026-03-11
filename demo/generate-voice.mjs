/**
 * UTCT UX Demo — Voice-Over Generation Script (Node.js)
 *
 * Generates narration audio from the SSML transcript using Azure Speech REST API.
 * Credentials are read from Azure Key Vault (garretm-dev) automatically,
 * falling back to AZURE_SPEECH_KEY / AZURE_SPEECH_REGION env vars.
 *
 * Prerequisites:
 *   npm install (installs @azure/identity and @azure/keyvault-secrets)
 *
 * Usage:
 *   node generate-voice.js                              # Generate with defaults
 *   node generate-voice.js --voice en-US-AndrewNeural   # Specify voice
 *   node generate-voice.js --output narration.mp3       # Specify output file
 */

import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const KEYVAULT_NAME = 'garretm-dev';
const SECRET_NAME_KEY = 'speech-key';
const SECRET_NAME_REGION = 'speech-region';

async function getCredentialsFromKeyVault() {
  try {
    const credential = new DefaultAzureCredential();
    const vaultUrl = `https://${KEYVAULT_NAME}.vault.azure.net`;
    const client = new SecretClient(vaultUrl, credential);

    const [keySecret, regionSecret] = await Promise.all([
      client.getSecret(SECRET_NAME_KEY),
      client.getSecret(SECRET_NAME_REGION),
    ]);

    console.log(`✓ Credentials loaded from Key Vault '${KEYVAULT_NAME}'`);
    return { key: keySecret.value, region: regionSecret.value };
  } catch (e) {
    console.log(`⚠ Could not read from Key Vault '${KEYVAULT_NAME}': ${e.message}`);
    return null;
  }
}

async function getCredentials() {
  // Try Key Vault first
  const kv = await getCredentialsFromKeyVault();
  if (kv) return kv;

  // Fall back to environment variables
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (key && region) {
    console.log('✓ Credentials loaded from environment variables');
    return { key, region };
  }

  console.error('ERROR: Could not obtain credentials from Key Vault or environment variables.');
  console.error(`  1. Ensure you're logged in with 'az login' (Key Vault: ${KEYVAULT_NAME})`);
  console.error('  2. Or set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars');
  process.exit(1);
}

async function generateAudio(ssmlPath, outputPath, voiceName) {
  const { key, region } = await getCredentials();

  const ssmlContent = readFileSync(ssmlPath, 'utf-8');

  console.log(`\nGenerating voice-over...`);
  console.log(`  Voice: ${voiceName}`);
  console.log(`  SSML:  ${ssmlPath}`);
  console.log(`  Output: ${outputPath}\n`);

  // Azure Speech REST API — use highest quality uncompressed format
  // 48kHz output automatically invokes the high-fidelity voice model
  const outputFormat = outputPath.endsWith('.wav')
    ? 'riff-48khz-16bit-mono-pcm'
    : 'audio-48khz-192kbitrate-mono-mp3';

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': 'utctux-demo',
    },
    body: ssmlContent,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Speech synthesis failed (${response.status}):`);
    console.error(`   Status: ${response.statusText}`);
    console.error(`   Output format: ${outputFormat}`);
    console.error(`   Response: ${errorText || '(empty)'}`);
    console.error(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`);
    process.exit(1);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, audioBuffer);

  const durationEstimate = (audioBuffer.length / (192000 / 8)).toFixed(1);
  console.log(`✅ Audio generated successfully!`);
  console.log(`   Size: ${(audioBuffer.length / 1024).toFixed(0)} KB`);
  console.log(`   Est. duration: ~${durationEstimate}s`);
  console.log(`   Saved to: ${outputPath}`);
}

// Parse args
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const ssmlFile = getArg('ssml', 'transcript-ssml.xml');
const outputFile = getArg('output', 'narration.wav');
const voice = getArg('voice', 'en-US-AndrewNeural');

const ssmlPath = resolve(__dirname, ssmlFile);
const outputPath = resolve(__dirname, outputFile);

generateAudio(ssmlPath, outputPath, voice);
