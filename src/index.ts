import { readFile, writeFile } from 'fs/promises';
import { Font, Glyph, parse } from 'opentype.js';
import type { OutputAsset, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';
import { compress, decompress } from 'wawoff2';

type PluginConfig = {
    whitelist?: Array<string>;
};

// We put this outside of the plugin so it persists between builds
// If two builds are ran (e.g. ssr and dom) then one build might not get the classes
// This happens with SvelteKit, and creates inconsistent behaviour
let classList = new Array<string>();

export default (config: PluginConfig = {}): Plugin => {
    return {
        name: 'vite-plugin-strip-font',

        // Before anything is written, read all of the relevant code
        // We want to do this before writeBundle because it's async, and might get called multiple times
        // as mentioned above.
        async generateBundle(_, bundle) {
            const files = Object.values(bundle);
            const chunks = files
                .filter((f) => f.type === 'chunk') as Array<OutputChunk>;

            for (const chunk of chunks) {
                // Use regex to find all classes that use 'bi-' and add them to a list
                const regex = /(?:class|className)="([^"]+)"/g;
                const matches = chunk.code.matchAll(regex);

                for (const match of matches) {
                    for (const className of match[1].split(' ')) {
                        if (className.startsWith('bi-')) {
                            classList.push(className.substring(3)); // Remove 'bi-'
                        }
                    }
                }
            }

            // Add the whitelist to the class list
            if (config.whitelist) {
                classList.push(...config.whitelist);
            }

            // Firefox seems unable to read the first glyph, and I'm not sure why
            // I'll just insert an empty glyph at the start to fix it
            classList.unshift('');

            // Remove duplicates
            classList = [...new Set(classList)];
        },

        // After everything is done, us 'fs' to manually update the font and css files
        async writeBundle(options, bundle) {
            const files = Object.values(bundle);
            const fonts = files
                .filter((f) => f.name === 'bootstrap-icons.woff' || f.name === 'bootstrap-icons.woff2') as Array<OutputAsset>;
            const css = files
                .filter((f) => f.name?.endsWith('.css')) as Array<OutputAsset>;

            // Strip css
            await Promise.all(css.map(async (file) => {
                const path = options.dir + '/' + file.fileName;
                const content = await readFile(path, 'utf-8');

                // Remove all '.bi-xxx:before' classes that aren't in classList using regex
                const regex = /\.bi-([a-zA-z0-9\-]+):before\s*{[^}]+}/g;
                const matches = content.matchAll(regex);

                let newContent = content;
                for (const match of matches) {
                    if (!classList.includes(match[1])) {
                        newContent = newContent.replace(match[0], '');
                    }
                }

                await writeFile(path, newContent);
            }));

            // Strip fonts
            await Promise.all(fonts.map(async (file) => {
                const path = options.dir + '/' + file.fileName;
                const buffer = await readFile(path);

                // Convert woff2 to ttf because opentype.js doesn't support it
                let data = file.name?.endsWith('.woff2')
                    ? (await decompress(new Uint8Array(buffer))).slice(0) // Need to slice, for some reason the buffer has wrong size, breaks opentype.js
                    : new Uint8Array(buffer);

                let font: Font;
                try {
                    font = parse(data!.buffer);
                } catch (e) {
                    console.error(`Unable to import font ${path}:`);
                    throw e;
                }

                // Strip font

                // Trim the POST table (contains glyph names and ids)
                font.tables.post['names'] = classList;
                font.tables.post['glyphNameIndex'] = classList.map((i) => i);
                font.tables.post['numberOfGlyphs'] = classList.length;

                // Replace the glyph set (contains glyph data)
                const newGlyphs = new Array<Glyph>();
                classList.map((className, i) => {
                    const glyphsAsArray = Object.values(font.glyphs['glyphs']) as Array<Glyph>;
                    const foundGlyph = glyphsAsArray.find((glyph) => glyph.name === className);
                    if (!foundGlyph) { throw new Error(`Glyph ${className} not found`); }

                    // Reassign the glyph index to the new index
                    // If we keep the old index, then opentype.js will break because of missing entries
                    foundGlyph.index = i;
                    newGlyphs.push(foundGlyph);
                });

                // Adjust the 'length' and 'numGlyphs' properties, otherwise the browser will complain
                // @ts-expect-error
                font.glyphs['length'] = font.glyphs['numGlyphs'] = classList.length;
                font.glyphs['glyphs'] = Object.fromEntries(newGlyphs.map((v) => [v.index, v]));

                try {
                    data = new Uint8Array(font.toArrayBuffer());
                } catch (e) {
                    console.error(`Unable to export font ${font.names.fullName.en}:`);
                    throw e;
                }

                // Convert back to woff2
                data = file.name?.endsWith('.woff2')
                    ? await compress(data)
                    : data;

                await writeFile(path, data);
            }));
        },

    };
};