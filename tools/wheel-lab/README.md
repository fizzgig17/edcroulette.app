# Wheel lab

Runs the real `RouletteSpinner` in a headless browser (Playwright) with sample gear, so wheel changes can be checked without a phone build.

    node tools/wheel-lab/run.mjs

Checks: square windows at five screen sizes, no horizontal overflow, tap to lock, press-and-hold editing, + tile, drag to reorder (and that it sticks), change category, remove, add up to six, repeated categories, a spin landing every wheel, and no console errors. Screenshots go to /tmp/wheel-lab-shots.

It swaps in temporary files and restores them on exit. Web only: no haptics, sound, real touch or Alert dialogs (so Reset can't be tested here).
