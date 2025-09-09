Place static game assets here (images, spritesheets, atlases, audio).

Recommended subfolders:
- images/  (single images)
- spritesheets/ (spritesheet PNGs + JSON if using TexturePacker)
- atlases/ (multi-atlas output)
- audio/
- data/ (tilemaps, json packs)

In Phaser code you can load with relative paths from public root, e.g.:
 this.load.image('logo', 'assets/images/logo.png');
 this.load.spritesheet('hero', 'assets/spritesheets/hero.png', { frameWidth: 32, frameHeight: 32 });

If you prefer bundling via imports (hashing / tree-shaking) you can alternatively put assets under src/assets and import them; for large sets or external tools, public/ is simpler.
