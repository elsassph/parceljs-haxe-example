# Parcel.js Haxe POC

A proof-of-concept Haxe plugin for [Parcel.js](https://parceljs.org/),
the *"Blazing fast, zero configuration web application bundler"*

## WIP

### Parcel bugs

- Can't watch a glob path (e.g. `*.hx`); bug raised, workaround included,
- Re-executes main bundle several times; bug raised,
- HMR evals bundle changes instead of loading as file, which means you can't use get sourcemaps/breakpoints; request raised.

### Haxe Loader

- Based on old Webpack Haxe Loader code; needs to be updated, maybe common code shared?

## Dev

    yarn start

## Production

    yarn run clean
    yarn build
