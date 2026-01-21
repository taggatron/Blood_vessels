# Blood Vessels & Circulation Simulator

A small, dependency-free interactive web simulation with multiple tabs:
- Vessel structure explorer (artery / capillary / vein)
- Drag-and-drop assessment
- Animated heart + pulmonary/systemic circulation loops with organ capillary beds

## Run locally (recommended)
From the repository root:

```bash
python3 -m http.server 5173
```

Then open:
- http://localhost:5173/

## GitHub Pages (Option B)
Enable GitHub Pages to serve from the repository root:
- GitHub → Settings → Pages
- Build and deployment → Source: **Deploy from a branch**
- Branch: **main** / **(root)**

Your URL will be:
- https://taggatron.github.io/Blood_vessels/

## Notes
- This is a teaching visualization (simplified model).
- Works offline after you load it once.
