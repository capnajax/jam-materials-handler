'use strict';

/**
 * Markdown-it breadcrumbs plugin. All it does is replace ${breadcrumbs} with
 * <div id="breadcrumbs"></div> for client-side population.
 */

function markdownItBreadcrumbs(md, options = {}) {

  // Inline rule for comment parsing
  function breadcrumbsRule(state, silent) {
    const start = state.pos;
    const max = state.posMax;

    // Check if we're at the start of a status: ${status 
    if (start + '${breadcrumbs}'.length != max) return false;
    if (state.src.slice(start, start + '${breadcrumbs}'.length) !== '${breadcrumbs}') return false;

    state.pos = start + '${breadcrumbs}'.length;
    return true;
  }

  // Register the inline rule
  md.inline.ruler.after('emphasis', 'breadcrumbs', breadcrumbsRule);

  // Renderer for comment tokens
  md.renderer.rules.breadcrumbs = function(tokens, idx) {
    
    return '<div id="breadcrumbs"></div>';
  };
}

export default markdownItBreadcrumbs;
