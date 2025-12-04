'use strict';

/**
 * Markdown-it status plugin. All it does is remove ${status ...} constructs.
 */

function markdownItStatus(md, options = {}) {

  // Inline rule for comment parsing
  function statusRule(state, silent) {
    const start = state.pos;
    const max = state.posMax;

    console.log('statusRule at pos', start, 'max', max,
      max - start > 10 ? state.src.substr(start, 10) + '...' : state.src.charAt(start)
    );

    // Check if we're at the start of a status: ${status 
    if (start + 'status'.length + 3 > max) return false;
    if (state.src.slice(start, start + 'status'.length + 3) !== `\${status `) return false;

    // Find the closing brace
    let pos = start + 'status'.length + 3;
    let foundEnd = false;
    while (pos < max) {
      if (state.src[pos] === '}') {
        if (pos-1 >= start && state.src[pos-1] === '\\') {
          // Escaped closing brace, skip it
          pos++;
          continue;
        }
        foundEnd = true;
        break;
      }
      pos++;
    }

    if (!foundEnd) return false;

    console.log('FOUND status from', start, 'to', pos);
    
    state.pos = pos + 1; // Move past the closing }
    return true;
  }

  // Register the inline rule
  md.inline.ruler.after('emphasis', 'status', statusRule);

  // Renderer for comment tokens
  md.renderer.rules.status = function(tokens, idx) {
    
    return '';
  };
}

export default markdownItStatus;
