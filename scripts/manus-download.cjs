#!/usr/bin/env node

/**
 * manus-download.js
 *
 * Automation script to check Manus task status and download completed infographics.
 *
 * Usage:
 *   node scripts/manus-download.js
 *
 * Exit codes:
 *   0 = all tasks complete, all images downloaded
 *   1 = some tasks still pending
 *   2 = API error or download failure
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Manus API configuration
const MANUS_API_KEY = 'sk-_0Hj_sM7uAPKxXJEzZpdvDzFkGxuR4AfahipE9QeF7OimOx5L8gax75HIG0b-XlMyPfv_nR98IMXKlZJ';
const MANUS_API_BASE = 'https://api.manus.ai/v1';

// Task definitions
const TASKS = [
  {
    id: 'bk8bBjokPSWQS2wKkKXMCq',
    name: 'complete-system',
    fileName: 'economic-layer-complete-system.png',
    description: 'All 5 layers with flow arrows and flywheel',
    useCase: 'README hero image, social sharing, presentations'
  },
  {
    id: 'aLQPEXTFtWP8iqeWf7Fjxu',
    name: 'flywheel',
    fileName: 'economic-layer-flywheel.png',
    description: 'Large circular diagram showing value flow cycle',
    useCase: 'Social posts highlighting network effects'
  },
  {
    id: 'QxoPj8bMmCFcaDE6jCVMCk',
    name: 'payments',
    fileName: 'economic-layer-payments.png',
    description: 'Transaction flow and smart contracts',
    useCase: 'Technical documentation for payment infrastructure'
  },
  {
    id: 'KHcJcrA6ydGD42peY7ricd',
    name: 'reputation-tiers',
    fileName: 'economic-layer-reputation-tiers.png',
    description: 'Vertical tier progression from Genesis to Diamond',
    useCase: 'Gamification and tier system explanation'
  },
  {
    id: 'D6aaEm2yFQBAsGQvUhJag3',
    name: 'genesis-liquidity',
    fileName: 'economic-layer-genesis-liquidity.png',
    description: '20% MAX APY and optimal strategy',
    useCase: 'Liquidity mining marketing materials'
  }
];

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../docs/images/economic-layer');

/**
 * Make HTTPS request to Manus API
 */
function manusRequest(taskId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.manus.ai',
      path: `/v1/tasks/${taskId}`,
      method: 'GET',
      headers: {
        'API_KEY': MANUS_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Download file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        reject(new Error(`HTTP ${response.statusCode} when downloading ${url}`));
      }
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up partial file
      reject(err);
    });
  });
}

/**
 * Extract file URL from Manus API response
 */
function extractFileUrl(response) {
  if (response.status !== 'completed') {
    return null;
  }

  // Navigate the response structure to find output_file
  if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.type === 'output_file' && content.fileUrl) {
            return content.fileUrl;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Main execution
 */
async function main() {
  console.log('🌊 Manus Infographic Downloader\n');
  console.log(`Checking status of ${TASKS.length} tasks...\n`);

  const results = [];
  let allComplete = true;
  let hasErrors = false;

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created output directory: ${OUTPUT_DIR}\n`);
  }

  // Check each task
  for (const task of TASKS) {
    process.stdout.write(`Checking ${task.name}... `);

    try {
      const response = await manusRequest(task.id);
      const status = response.status;

      if (status === 'completed') {
        const fileUrl = extractFileUrl(response);

        if (fileUrl) {
          const outputPath = path.join(OUTPUT_DIR, task.fileName);

          try {
            await downloadFile(fileUrl, outputPath);
            const stats = fs.statSync(outputPath);
            const sizeKB = (stats.size / 1024).toFixed(2);

            console.log(`✓ Downloaded (${sizeKB} KB)`);

            results.push({
              ...task,
              status: 'completed',
              downloaded: true,
              fileSize: stats.size,
              manusUrl: `https://manus.im/app/${task.id}`
            });
          } catch (downloadErr) {
            console.log(`✗ Download failed: ${downloadErr.message}`);
            hasErrors = true;

            results.push({
              ...task,
              status: 'completed',
              downloaded: false,
              error: downloadErr.message
            });
          }
        } else {
          console.log(`✗ No file URL found in response`);
          hasErrors = true;

          results.push({
            ...task,
            status: 'completed',
            downloaded: false,
            error: 'No file URL in response'
          });
        }
      } else {
        console.log(`⏳ Still ${status}`);
        allComplete = false;

        results.push({
          ...task,
          status,
          downloaded: false
        });
      }
    } catch (err) {
      console.log(`✗ API error: ${err.message}`);
      hasErrors = true;

      results.push({
        ...task,
        status: 'error',
        downloaded: false,
        error: err.message
      });
    }
  }

  // Generate manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    totalTasks: TASKS.length,
    completed: results.filter(r => r.status === 'completed').length,
    downloaded: results.filter(r => r.downloaded).length,
    images: results
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✓ Generated manifest: ${manifestPath}\n`);

  // Summary
  console.log('═══════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total tasks:      ${TASKS.length}`);
  console.log(`Completed:        ${manifest.completed}`);
  console.log(`Downloaded:       ${manifest.downloaded}`);
  console.log(`Pending:          ${TASKS.length - manifest.completed}`);
  console.log(`Errors:           ${results.filter(r => r.error).length}`);
  console.log('═══════════════════════════════════════\n');

  // Task URLs for pending
  const pending = results.filter(r => r.status !== 'completed');
  if (pending.length > 0) {
    console.log('Pending tasks - check these URLs:');
    pending.forEach(t => {
      console.log(`  • ${t.name}: https://manus.im/app/${t.id}`);
    });
    console.log('');
  }

  // Exit codes
  if (hasErrors) {
    console.log('⚠️  Some errors occurred during download');
    process.exit(2);
  } else if (!allComplete) {
    console.log('⏳ Some tasks still pending - run again later');
    process.exit(1);
  } else {
    console.log('✅ All infographics downloaded successfully!');
    process.exit(0);
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
