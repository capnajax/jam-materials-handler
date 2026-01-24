#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { resolveFile, setTemplateConfig } from '../src/file-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock includes server
let mockServer;
const MOCK_PORT = 18080;

function startMockServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      // Return minimal HTML for includes
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!-- Mock include: ${req.url} -->`);
    });
    mockServer.listen(MOCK_PORT, () => {
      process.env.INCLUDES_SERVICE_PORT = MOCK_PORT;
      process.env.INCLUDES_SERVICE_HOST = 'localhost';
      resolve();
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * Test runner for Handlebars template functionality
 */
class HandlebarsTestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.testDir = path.join(__dirname, 'test-handlebars-content');
  }

  /**
   * Add a test case
   * @param {string} name - Test name
   * @param {Function} testFn - Test function
   */
  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  /**
   * Assert that two values are equal
   * @param {*} actual - Actual value
   * @param {*} expected - Expected value
   * @param {string} message - Error message
   */
  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual  : ${JSON.stringify(actual)}`);
    }
  }

  /**
   * Assert that actual contains expected substring
   * @param {string} actual - Actual string
   * @param {string} expected - Expected substring
   * @param {string} message - Error message
   */
  assertContains(actual, expected, message = '') {
    if (!actual.includes(expected)) {
      throw new Error(`${message}\nExpected to contain "${expected}"\nActual: "${actual}"`);
    }
  }

  /**
   * Setup test directory and files
   */
  async setup() {
    // Create test directory
    await fs.mkdir(this.testDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(this.testDir, 'test-basic.md.hbs'),
      '# {{ title | Default Title }}\n\nAuthor: {{ author | Unknown }}'
    );

    await fs.writeFile(
      path.join(this.testDir, 'test-plain.md'),
      '# Plain Markdown\n\nThis has {{ no | template }} processing.'
    );

    await fs.writeFile(
      path.join(this.testDir, 'test-html.html'),
      '<html><body>Static HTML</body></html>'
    );

    await fs.writeFile(
      path.join(this.testDir, 'test-priority.md.hbs'),
      '# Handlebars Version\n\nValue: {{ value | default }}'
    );

    await fs.writeFile(
      path.join(this.testDir, 'test-priority.html'),
      '<html><body>This should be ignored</body></html>'
    );
  }

  /**
   * Cleanup test directory
   */
  async cleanup() {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }

  /**
   * Run all tests
   */
  async run() {
    console.log('🧪 Running Handlebars Template Tests\n');

    try {
      await startMockServer();
      await this.setup();

      for (const { name, testFn } of this.tests) {
        try {
          await testFn();
          console.log(`✅ ${name}`);
          this.passed++;
        } catch (error) {
          console.log(`❌ ${name}`);
          console.log(`   Error: ${error.message}\n`);
          this.failed++;
        }
      }

      await this.cleanup();
      await stopMockServer();
    } catch (error) {
      console.error('Setup/cleanup error:', error);
      await stopMockServer();
      process.exit(1);
    }

    console.log(`\n📊 Test Results:`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📋 Total: ${this.tests.length}`);

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Create test runner instance
const runner = new HandlebarsTestRunner();

// Test: .md.hbs file with template variables
runner.test('.md.hbs file processes Handlebars templates', async () => {
  setTemplateConfig({
    variables: {
      title: 'Test Document',
      author: 'John Doe'
    }
  });

  const result = await resolveFile('/test-basic.html', runner.testDir);
  
  runner.assertEqual(result.status, 200, 'Should return 200 status');
  runner.assertEqual(result.contentType, 'text/html; charset=utf-8', 'Should return HTML content type');
  
  const html = result.buffer.toString('utf-8');
  runner.assertContains(html, 'Test Document', 'Should contain title from config');
  runner.assertContains(html, 'John Doe', 'Should contain author from config');
});

// Test: .md.hbs file with default values
runner.test('.md.hbs file uses default values when config missing', async () => {
  setTemplateConfig({
    variables: {}
  });

  const result = await resolveFile('/test-basic.html', runner.testDir);
  
  runner.assertEqual(result.status, 200, 'Should return 200 status');
  
  const html = result.buffer.toString('utf-8');
  runner.assertContains(html, 'Default Title', 'Should use default title');
  runner.assertContains(html, 'Unknown', 'Should use default author');
});

// Test: Plain .md file does NOT process template variables
runner.test('Plain .md file does not process template variables', async () => {
  setTemplateConfig({
    variables: {
      no: 'YES',
      template: 'PROCESSED'
    }
  });

  const result = await resolveFile('/test-plain.html', runner.testDir);
  
  runner.assertEqual(result.status, 200, 'Should return 200 status');
  
  const html = result.buffer.toString('utf-8');
  runner.assertContains(html, '{{ no | template }}', 'Should NOT process template variables');
});

// Test: File priority - .md.hbs over .html
runner.test('File priority: .md.hbs takes precedence over .html', async () => {
  setTemplateConfig({
    variables: {
      value: 'from-handlebars'
    }
  });

  const result = await resolveFile('/test-priority.html', runner.testDir);
  
  runner.assertEqual(result.status, 200, 'Should return 200 status');
  
  const html = result.buffer.toString('utf-8');
  runner.assertContains(html, 'Handlebars Version', 'Should use .md.hbs file');
  runner.assertContains(html, 'from-handlebars', 'Should process Handlebars template');
});

// Test: Static HTML file when no .md.hbs or .md exists
runner.test('Static HTML file served when no templates exist', async () => {
  const result = await resolveFile('/test-html.html', runner.testDir);
  
  runner.assertEqual(result.status, 200, 'Should return 200 status');
  
  const html = result.buffer.toString('utf-8');
  runner.assertContains(html, 'Static HTML', 'Should serve static HTML');
});

// Test: 404 when no files exist
runner.test('404 when no matching files exist', async () => {
  const result = await resolveFile('/nonexistent.html', runner.testDir);
  
  runner.assertEqual(result.status, 404, 'Should return 404 status');
});

// Run all tests
runner.run().catch(console.error);

// Made with Bob
