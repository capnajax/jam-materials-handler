'use strict';
import { promises as fs } from 'fs';
import http from 'http';
import path from 'path';
import MarkdownIt from 'markdown-it';
// TOC plugin for automatic table of contents
import markdownItTocDoneRight from 'markdown-it-toc-done-right';
// Comment plugin for development comments
import {markdownItComment, markdownItIssue} from './markdown-it/comment.js';

const INCLUDES = ['header', 'footer', 'head', 'image-modal'];

/**
 * Reads a file from the include directory
 * @param {string} filename the name of the file without the `.html` extension
 * @returns {Promise<string>} the content of the include file
 */
function includeHtml(filename) {
  return new Promise((resolve, reject) => {
    if (!INCLUDES.includes(filename)) {
      throw new Error(`Include file "${filename}" is not recognized.`);
    }
    const includesPort = process.env.INCLUDES_SERVICE_PORT || 80;
    const includesHost = process.env.INCLUDES_SERVICE_HOST || 'localhost';
    const path =
      `http://${includesHost}:${includesPort}/includes/${filename}.html`;
    const request = http.get(path, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
      res.on('error', () => {
        reject(`Error fetching include file "${filename}"`);
      });
      if (res.statusCode != 200) {
        reject(`Failed to fetch include file "${path}": ${res.statusCode}`);
      }
    });
  });
}

// Initialize markdown-it with default options
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  xhtmlOut: true
});

// Add TOC plugin
md.use(markdownItTocDoneRight, {
  containerClass: 'table-of-contents',
  listType: 'ul',
  level: [1, 2, 3, 4, 5, 6],
  includeLevel: [1, 2, 3, 4, 5, 6],
  listClass: 'toc-list',
  itemClass: 'toc-item',
  linkClass: 'toc-link'
});

// Add comment plugin
md.use(markdownItComment, {
  debug:
    process.env.DEBUG === 'true' || 
    ['local', 'development'].includes(process.env.NODE_ENV)
});
md.use(markdownItIssue, {
  debug:
    process.env.DEBUG === 'true' || 
    ['local', 'development'].includes(process.env.NODE_ENV)
});


// Add custom heading renderer for automatic IDs
md.renderer.rules.heading_open = function (tokens, idx, options, env, renderer) {
  const token = tokens[idx];
  const level = token.tag;
  
  // Get the heading text from the next token (which should be inline)
  let headingText = '';
  if (tokens[idx + 1] && tokens[idx + 1].type === 'inline') {
    headingText = tokens[idx + 1].content;
  }
  
  // Generate slug from heading text
  const slug = generateSlug(headingText);
  
  // Add id attribute
  token.attrPush(['id', slug]);
  
  return renderer.renderToken(tokens, idx, options);
};

/**
 * Generates a URL-friendly slug from text
 * @param {string} text - The text to convert to a slug
 * @returns {string} URL-friendly slug
 */
function generateSlug(text) {
  return text
    .toLowerCase()                    // Convert to lowercase
    .trim()                          // Remove leading/trailing whitespace
    .replace(/[^\w\s-]/g, '')        // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-')            // Replace spaces with hyphens
    .replace(/-+/g, '-')             // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '');        // Remove leading/trailing hyphens
}

// Default template configuration
const defaultTemplateConfig = {
  variables: {
    title: "Document",
    author: "Unknown",
    date: new Date().toLocaleDateString(),
    version: "1.0.0",
    organization: "Your Organization"
  }
};

let templateConfig = { ...defaultTemplateConfig };

/**
 * Updates the template configuration (called from admin module)
 * @param {Object} config - New template configuration
 */
function updateTemplateConfig(config) {
  templateConfig = { ...defaultTemplateConfig, ...config };
}

/**
 * Gets the current template configuration
 * @returns {Object} Current template configuration
 */
function getTemplateConfig() {
  return templateConfig;
}

/**
 * Parses template variables from markdown content
 * Format: {{ name | default }} or {{ name }}
 * @param {string} content - Content with template variables
 * @returns {string} Content with variables replaced
 */
function parseTemplateVariables(content) {
  // Regex to match template variables: {{ name | default }} or {{ name }}
  // Handles whitespace and escaped braces in default values

  // we're gonna do this the hard way. Iterate character by character to
  // properly handle spaces, escaping, and braces.

  const outside = 0;
  const insideName = 1;
  const insideDefault = 2;
  let phase = outside;

  // last character if it's unescaped. escaped characters are not stored here.
  // anything in lastChar has not yet been added to output.
  let lastChar = '';
  let output = '';
  let name = null;
  let defaultValue = null;

  // resolve escapes and detect the second character of unescaped `{{` and `}}`
  const deEscape = (char) => {
    const result = { char: null, isDoubleBrace: false };
    if (lastChar === '\\') {
      lastChar = '';
      result.char = char;
    } else if (['{', '}'].includes(char)) {
      if (lastChar === char) {
        lastChar = '';
        result.char = char + char;
        result.isDoubleBrace = true;
      } else {
        result.char = lastChar;
        lastChar = char;
      }
    } else if (char === '\\') {
      result.char = '';
      lastChar = '\\';
    } else {
      result.char = lastChar + char;
      lastChar = '';
    }
    return result;
  }

  const isNil = (val) => val === null || val === undefined;

  const addValue = () => {
    let value = defaultValue === null
      ? {span: `<span class='failed-substitution'>${name}</span>`}
      : defaultValue;

    if (!isNil(templateConfig.variables[name])) {
      value = templateConfig.variables[name];
    }

    if (typeof value === 'object' && 'span' in value) {
      console.warn(`No value found for template variable "${name}"`);
      value = value.span.trim();
    }

    output += value.trim();
  }

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    let deEscaped;
    switch (phase) {
      case outside:
        deEscaped = deEscape(char);
        if (deEscaped.isDoubleBrace && deEscaped.char === '{{') {
          phase = insideName;
          name = '';
          lastChar = '';
        } else {
          output += deEscaped.char;
        }
        break;
      case insideName:
        // there is no escaping inside name
        if (char === '|') {
          name = name.trim();
          phase = insideDefault;
        } else if (char === '}') {
          // look ahead for second }
          if (i + 1 < content.length && content[i + 1] === '}') {
            name = name.trim();
            addValue();
            i++;
            phase = outside;
            name = null;
            defaultValue = null;
          } else {
            name += char;
          }
        } else {
          name += char;
        }
        break;
      case insideDefault:
        deEscaped = deEscape(char);
        if (deEscaped.isDoubleBrace && deEscaped.char === '}}') {
          defaultValue = defaultValue === null ? '' : defaultValue;
          addValue();
          phase = outside;
          name = null;
          defaultValue = null;
        } else {
          defaultValue =
            (defaultValue === null ? '' : defaultValue) + deEscaped.char;
        }
        break;
    }
  }
  return output;
}

/**
 * Resolves a file path and returns the file content with appropriate HTTP status
 * @param {string} requestPath - The requested path (relative to base directory)
 * @param {string} baseDirectory - The base directory to serve files from
 * @returns {Promise<{status: number, buffer: Buffer, contentType?: string}>}
 */
export async function resolveFile(requestPath, basePath) {
  try {
    // Normalize the request path
    const normalizedPath = path.normalize(requestPath);
    
    // Prevent directory traversal attacks
    if (normalizedPath.includes('..')) {
      return {
        status: 403,
        buffer: Buffer.from('Forbidden: Directory traversal not allowed')
      };
    }

    // Build the full file path
    let fullPath = path.join(basePath, normalizedPath);
    
    // Check if the path exists
    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Don't return 404 here - continue to file reading logic which handles HTML->MD conversion
        stats = null;
      } else {
        throw error;
      }
    }

    // If it's a directory, look for index.html
    if (stats && stats.isDirectory()) {
      try {
        await fs.access(path.join(fullPath, 'index.html'));
      } catch (error) {
        if (error.code === 'ENOENT') {
          try {
            await fs.access(path.join(fullPath, 'index.md'));
          } catch (error) {
            if (error.code === 'ENOENT') {
              console.warn(
                'Directory index not found for',
                path.join(fullPath, 'index.[html|md]')
              );
              return {
                status: 404,
                buffer: Buffer.from('Directory index not found')
              };
            } else {
              throw error;
            }
          }
        } else {
          throw error;
        }
      }
      fullPath = path.join(fullPath, 'index.html')
    }

    // Try to read the requested file
    try {
      const fileBuffer = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      
      return {
        status: 200,
        buffer: fileBuffer,
        contentType: getContentType(ext)
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // If it's an HTML file that doesn't exist, check for markdown
        if (path.extname(fullPath).toLowerCase() === '.html') {
          const markdownPath = fullPath.replace(/\.html?$/i, '.md');
          
          try {
            const markdownContent = await fs.readFile(markdownPath, 'utf8');
            // Process template variables before converting to HTML
            const processedMarkdown = parseTemplateVariables(markdownContent);
            const htmlContent = await convertMarkdownToHtml(
              processedMarkdown, path.basename(markdownPath, '.md')
            );
            
            return {
              status: 200,
              buffer: Buffer.from(htmlContent),
              contentType: 'text/html; charset=utf-8'
            };
          } catch (mdError) {
            if (mdError.code === 'ENOENT') {
              return {
                status: 404,
                buffer: Buffer.from('File not found')
              };
            }
            throw mdError;
          }
        }
        
        return {
          status: 404,
          buffer: Buffer.from('File not found')
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('Error resolving file:', error);
    return {
      status: 500,
      buffer: Buffer.from('Internal server error')
    };
  }
}

/**
 * Converts markdown content to HTML with basic styling
 * @param {string} markdownContent - The markdown content to convert
 * @param {string} title - The title for the HTML page
 * @returns {string} Complete HTML document
 */
async function convertMarkdownToHtml(markdownContent, title = 'Document') {
  const htmlBody = md.render(markdownContent);
  
  // load these in parallel
  const neededIncludesPromises = {
    head: includeHtml('head'),
    header: includeHtml('header'),
    footer: includeHtml('footer'),
    imageModal: includeHtml('image-modal')
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${await neededIncludesPromises.head}
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="/public/markdown-it.css">
</head>
<body>
  ${await neededIncludesPromises.header}
  <div class="markdown-content">
    ${htmlBody}
  </div>
  ${await neededIncludesPromises.footer}
  ${await neededIncludesPromises.imageModal}
</body>
</html>`;
}

/**
 * Gets the appropriate Content-Type header for a file extension
 * @param {string} ext - File extension (including the dot)
 * @returns {string} Content-Type header value
 */
function getContentType(ext) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

export {
  convertMarkdownToHtml,
  getContentType,
  updateTemplateConfig,
  getTemplateConfig,
  parseTemplateVariables
};

