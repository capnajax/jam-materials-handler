'use strict';

/**
 * Markdown-it plugin for handling inline comments
 * Syntax: ${comment @author comment text here}
 * 
 * In DEBUG mode: renders as <div class="comment">...</div>
 * In production: renders as empty string
 */

function plugin(keyword = 'comment') {
  return function(md, options = {}) {

    let debugMode = options.debug || process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

    // Inline rule for comment parsing
    function commentRule(state, silent) {
      const start = state.pos;
      const max = state.posMax;

      console.log('commentRule at pos', start, 'max', max,
        max - start > 10 ? state.src.substr(start, 10) + '...' : state.src.charAt(start)
      );

      // Check if we're at the start of a comment: ${comment (or keyword)
      if (start + keyword.length + 3 > max) return false;
      if (state.src.slice(start, start + keyword.length + 3) !== `\${${keyword} `) return false;

      // Find the closing brace
      let pos = start + keyword.length + 3;
      let foundEnd = false;
      while (pos < max) {
        if (state.src[pos] === '}') {
          foundEnd = true;
          break;
        }
        pos++;
      }

      if (!foundEnd) return false;

      console.log('FOUND comment from', start, 'to', pos);

      // Extract the content between {$comment and }
      const content = state.src.slice(start + keyword.length + 3, pos).trim();

      // Parse author and comment text
      // Format: @author comment text
      let author = '';
      let commentText = '';
      
      const atIndex = content.indexOf('@');
      if (atIndex === 0) {
        // Find the end of the author name (first space)
        const spaceIndex = content.indexOf(' ');
        if (spaceIndex > 0) {
          author = content.slice(1, spaceIndex); // Skip the @
          commentText = content.slice(spaceIndex + 1).trim();
        } else {
          author = content.slice(1); // No comment text, just author
        }
      } else {
        // No author specified
        commentText = content;
      }

      if (!silent) {
        const token = state.push(keyword, '', 0);
        token.content = commentText;
        token.meta = { author };
      }

      state.pos = pos + 1; // Move past the closing }
      return true;
    }

    // Register the inline rule
    md.inline.ruler.after('emphasis', keyword, commentRule);

    // Renderer for comment tokens
    md.renderer.rules[keyword] = function(tokens, idx) {
      const token = tokens[idx];
      const author = token.meta?.author || '';
      const content = token.content || '';

      if (!debugMode) {
        return ''; // Return empty string in production
      }

      // Return formatted HTML in DEBUG mode
      let html = `<div class="${keyword}">`;
      if (author) {
        html += `<span class="author">@${author} </span>`;
      }
      if (content) {
        html += `<span class="message">${md.utils.escapeHtml(content)}</span>`;
      }
      html += '</div>';

      return html;
    };
  };
}

export const markdownItComment = plugin('comment');
export const markdownItIssue = plugin('issue');
