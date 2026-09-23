# Azure Pass

A single coastal mountain circuit for Newracer, designed as an environment first. The road is a continuous closed loop for a future car. The terrain, road, plants, rocks, water and sky geometry are generated in code. The static bundle includes three photographed surface images and Three.js; it makes no third-party asset requests at runtime.

**[Open the track](https://permabulk69420-pixel.github.io/Newracer/)** (GitHub Pages)

## Explore

- **Quest 3:** open the page in Meta Quest Browser and select **Enter VR**. Left stick moves, right stick turns smoothly, and either grip doubles your speed. Normal movement is deliberately quick at 16 m/s; running is 32 m/s.
- **Desktop:** select **Explore the coast**. WASD moves, Shift runs, mouse looks around. Click the scene for pointer lock; Escape releases it.
- **Phone preview:** use the two touch pads to move and look. Hold Run for extra speed.
- **Detail:** the on-screen toggle reduces resolution and scenery instances if needed. VR also raises fixed foveation in Eco mode.

The scene avoids dynamic shadows and post-processing. The track, barriers and terrain are static meshes; rocks and plants use instancing. Water is a single lightweight shader plane. This first pass still needs a frame-rate check in an actual Quest 3 headset.

## Surface image sources

The bundled asphalt comes from [Asphalt 02](https://polyhaven.com/a/asphalt_02), dry ground from [Dry Ground Rocks](https://polyhaven.com/a/dry_ground_rocks), and cliff rock from [Aerial Rocks 02](https://polyhaven.com/a/aerial_rocks_02), all by Rob Tuytel / Poly Haven under [CC0](https://polyhaven.com/license). They are 512 px derivatives of the sources listed in [RCForge's scenery credits](https://github.com/adithya-s-k/RCForge/blob/main/public/scenery/README.md).

## Run locally

```bash
npm ci
npm run dev
```

`npm run build` creates `dist/`. Every push to `main` builds and deploys it with `.github/workflows/pages.yml`. GitHub Pages must use **GitHub Actions** as its build and deployment source in the repository's Settings → Pages.
