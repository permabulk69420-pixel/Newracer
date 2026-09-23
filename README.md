# Azure Pass

A single coastal mountain circuit for Newracer, designed as an environment first. The road is a continuous closed loop for a future car. The island, asphalt, markings, guardrails, rocks, shrubs, water and sky are generated in code; there are no external 3D assets. The published bundle contains Three.js and runs as a static page.

**[Open the track](https://permabulk69420-pixel.github.io/Newracer/)** (GitHub Pages)

## Explore

- **Quest 3:** open the page in Meta Quest Browser and select **Enter VR**. Left stick moves, right stick turns smoothly, and either grip doubles your speed. Normal movement is deliberately quick at 16 m/s; running is 32 m/s.
- **Desktop:** select **Explore the coast**. WASD moves, Shift runs, mouse looks around. Click the scene for pointer lock; Escape releases it.
- **Phone preview:** use the two touch pads to move and look. Hold Run for extra speed.
- **Detail:** the on-screen toggle reduces resolution and scenery instances if needed. VR also raises fixed foveation in Eco mode.

The scene avoids dynamic shadows and post-processing. The track, barriers and terrain are static meshes; rocks and plants use instancing. Water is a single lightweight shader plane. This first pass still needs a frame-rate check in an actual Quest 3 headset.

## Run locally

```bash
npm ci
npm run dev
```

`npm run build` creates `dist/`. Every push to `main` builds and deploys it with `.github/workflows/pages.yml`. GitHub Pages must use **GitHub Actions** as its build and deployment source in the repository's Settings → Pages.
