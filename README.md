# vite-purge-bootstrap-icons

####

> **FOREWORD**
> Modifying fonts for performance is usually pointless. As of writing this, the woff2 file for `boostrap-icons` is only 119kb, and the css is 94kb. Using a tool like PurgeCSS will cut that in half, so going further is probably overkill. Or not, I'm not your mom.

## Problem

When using [Bootstrap Icons](https://icons.getbootstrap.com/), there are [many ways to include the icons in your project](https://icons.getbootstrap.com/#usage). However, the easiest way is to include the entire package, which loads the icon as text, allowing for easy styling, not using inline svgs, etc.:

```html
<i class="bi bi-github" />
```

However, this is not ideal for performance, as there are 1800+ icons (~300kb). Again, there are [other ways that subvert this issue](https://icons.getbootstrap.com/#usage), but not all of them are ideal for every situation, especially when using a framework.

## Solution

This plugin will modify the `bootstrap-icons` package to only include the icons you use in your project. This includes removing css *and* modifying the font files at build time. With only a few icons, this reduces the package size to about 5kb.

## Usage

Make sure you have [Bootstrap Icons installed in your project](https://icons.getbootstrap.com/#package-manager). Then, import it in your css or scss.

Next, install the plugin:

```bash
npm i -D vite-plugin-purge-bootstrap-icons
```

Then, add it to your `vite.config.js`:

```js
import purgeBootstrapIcons from 'vite-plugin-purge-bootstrap-icons'
...
export default defineConfig({
  plugins: [ purgeBootstrapIcons({ /* Options */ }) ]
})
```

Optionally, provide an array to the `whitelist` parameter, without the `bi-` prefix:

```js
purgeBootstrapIcons({ whitelist: ['github', 'twitter'] })
```

> This plugin doesn't run in dev mode; rather only when building. Use `vite preview` to test it.