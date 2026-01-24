# Template

This is an update to `file-handler.js`. I want to use a more powerful templating engine than the existing `{{ var | default }}` that I currently have available. I will use handlebars to implement this.

## Handlebars

### Custom Syntax Support

The `{{ var | default }}` syntax should work in `.md.hbs` files. This will be implemented as either:

- A custom Handlebars helper, OR
- A preprocessing layer before Handlebars processes the template

**Decision needed**: Determine if Handlebars supports this syntax natively through a helper or if preprocessing is required.

### Template Variables

- Data source: `templateConfig.variables` (to be implemented separately)
- All Handlebars processing happens on-the-fly (no file caching/generation)
- Keep Handlebars features simple - only enable what's needed for the `{{ var | default }}` syntax

## New file priority

When an HTML file is requested, the file resolution priority is:

1. `.md.hbs` - Handlebars template processed → markdown → HTML (on-the-fly)
2. `.md` - Plain markdown → HTML (template variable feature REMOVED)
3. `.html` - Static HTML file

**Important**: If a `.md.hbs` exists alongside a `.html`, the `.html` is assumed to be a pre-rendered version with default values and should be ignored.

## Breaking Changes

- **`.md` files**: The `{{ var | default }}` template variable feature will be REMOVED from the markdown processor
- **Important**: Do NOT modify any existing `.md` files during implementation - user will handle file migrations manually
- **Backward compatibility**: Existing `.md` files will continue to render as markdown → HTML, just without template variable processing

## Implementation Notes

1. Handlebars is already imported in `file-handler.js` (line 6)
2. Current `parseTemplateVariables()` function (lines 214-328) will be:
   - Removed from `.md` file processing
   - Replaced with Handlebars processing for `.md.hbs` files
3. File resolution logic in `resolveFile()` (lines 336-460) needs updating:
   - Currently checks `.html` first, then `.md`
   - New order: `.md.hbs` → `.md` → `.html`
4. Processing flow for `.md.hbs`:
   - Read file → Process with Handlebars → Convert markdown to HTML → Return HTML
