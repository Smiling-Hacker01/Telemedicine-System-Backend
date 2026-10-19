import { createApp } from '../src/app/create-app.js';
import fs from 'fs';
import path from 'path';

async function exportOpenApi() {
  const app = await createApp();
  await app.ready();

  const openapiSchema = app.swagger();
  const outputDir = path.resolve(process.cwd(), 'docs/api');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(openapiSchema, null, 2), 'utf-8');

  console.log(`✓ OpenAPI specification exported to ${outputPath}`);
  await app.close();
}

exportOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI schema:', err);
  process.exit(1);
});
