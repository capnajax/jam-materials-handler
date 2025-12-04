# MD Handler

A Node.js HTTP server that serves markdown files with template variable processing.

## Local testing

For testing and preview purposes, this can be operated from a local desktop without a full-fledged jam-in-a-box environment.

To set up the local environment, do the following:

1. Clone three repositories into the same parent folder. These three projects are tightly coupled so you need all three to make the navigator work locall.

    1. [IBMIntegration/jam-materials](https://github.com/IBMIntegration/jam-materials). It is recommended to fork this repository before cloning so you can make updates to the tech jam materials.
    1. [IBMIntegration/jam-materials-handler](https://github.com/IBMIntegration/jam-materials-handler) or a fork thereof.
    1. [IBMIntegration/jam-navigator](https://github.com/IBMIntegration/jam-navigator).

1. Install the npm libraries

    ```sh
    cd jam-materials-handler
    npm install
    ```

1. Start the environment

    ```sh
    ./run-local.sh
    ```

1. Point your browser to [http://localhost:8080/tracks]

1. To refresh your test enviornment, hit `R`, to exit, `Q`.

## Markdown extensions

This application adds a few extensions to Markdown for convenience.

### Annotations

There are a few types of annotations availble that are not visible to the end user that may show up in DEBUG mode:

1. `${comment @initials my comment text}` puts a note in a file
1. `${issue @initials my comment text}` same as `${comment}` but in red
1. `${status for a block of text at the head of the document to explain what needs to be done and who has reviewed the document}

### Gadgets

You can add some generated content by adding these tags

1. `${toc}` Adds a table of contents
1. `${breadcrumbs}` Adds generated breadcrumbs

### Template strings

Use `{{ variable | default }}` syntax in your markdown files:

```markdown
# Hello {{ name | World }}!

This is a {{ type | demo }} file.
```
