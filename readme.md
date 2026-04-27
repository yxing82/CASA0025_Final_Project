# Las Vegas Valley Turf Tracker

**CASA0025 — Building Spatial Applications with Big Data | UCL CASA**

An interactive Google Earth Engine application that explores the environmental consequences of nonfunctional turf removal across the Las Vegas Valley, in the context of Nevada Assembly Bill 356 (2021).

**[View the Project Page](https://yxing82.github.io/CASA0025_Final_Project/)**

**[View the GEE Application](https://project-ba3da252-127d-4b0d-bf0.projects.earthengine.app/view/turf-tracker)**

---

## Overview

The Colorado River Basin is under severe stress. Runoff continues to decline while consumption remains constant. In response, Nevada's Assembly Bill 356 (2021) prohibited the use of Colorado River water to irrigate "nonfunctional turf" (green space with no clear recreational or functional purpose) by 2027. In January 2026, a group of residents sued the Southern Nevada Water Authority (SNWA), claiming that turf removal has led to negative environmental effects including increased local temperatures.

This project bridges the gap between regulatory action and observable evidence by building a map-based dashboard that enables tract-level exploration of green space loss, land surface temperature shifts, and water consumption changes from 2019 to 2026.

## Key Features

- **Synchronized split-panel maps** with a draggable swipe divider for before/after comparisons across any two months
- **Three environmental layers**: Fractional Vegetation Cover (greenness), Land Surface Temperature (heat), and Evapotranspiration (water consumption)
- **Tract-level profiling**: click any census tract to view summary statistics, distribution histograms, and monthly trend charts
- **Compare Tracts mode**: select two tracts for side-by-side statistical cards and overlaid trend charts
- **Seasonal adjustment toggle**: switch between raw values and change-from-2019-baseline to separate policy-driven trends from natural seasonality
- **Quick Navigation dropdown**: jump to incorporated cities (Las Vegas, Henderson, North Las Vegas) or Census-Designated Places

## Data Sources

| Dataset | Resolution | Purpose | Provider |
|---------|-----------|---------|----------|
| Sentinel-2 (MSI SR) | 10 m | Fractional Vegetation Cover via 5-endmember Spectral Mixture Analysis | Copernicus |
| Landsat 8 (Band 10) | 30 m | Land Surface Temperature | USGS |
| OpenET Ensemble | 30 m | Actual Evapotranspiration (proxy for outdoor water consumption) | OpenET |
| TIGER 2020 Census Tracts | — | Spatial aggregation boundaries | U.S. Census Bureau |

## Methodology

### Green Space Detection
Fractional Vegetation Cover (FVC) is estimated using a **5-endmember linear Spectral Mixture Analysis (SMA)** model applied to Sentinel-2 imagery. The five endmembers, green vegetation, soil, dark impervious (asphalt), bright impervious (concrete), and regional impervious (terra cotta roofing). These allow sub-pixel detection of turf patches ranging from office parks down to roundabouts. The model achieves a spectral RMSE of 0.011, well below the established 0.025 acceptability threshold.

### Land Surface Temperature
Monthly median LST is derived from Landsat 8 thermal infrared (Band 10), cloud-masked and converted to Celsius with gap-filling from prior months.

### Water Consumption
In arid Las Vegas where rainfall is minimal, evapotranspiration (ET) directly approximates irrigation-driven water use. OpenET's ensemble of six satellite-based models provides the ET estimates.

### Seasonal Adjustment
Each month from 2020–2025 is compared against the same calendar month in 2019 (the pre-policy baseline year), isolating human-caused changes from natural phenological cycles.

## Repository Structure

```
CASA0025_Final_Project/
├── index.qmd                                      # Quarto source for the GitHub Pages site
├── styles-test.css                                # Custom stylesheet for the project page
├── lasvegas_boundary                              # Study area boundary shape file folder
├── scripts/                               
│   ├── boundaries_extract.js                      # Boundaries extract script
│   ├── extract_lst.js                             # Temperature analysis script
│   ├── extract_water.js                           # Water analysis script
│   ├── pre-rendered-raster-tracts.js              # Preprocessing rendered raster tracts script
│   ├── preprocess_and_data_inspection.js          # Preprocessing general script
│   ├── turf_removal_detection.js                  # Turf detection script
│   └── ui-built/
│       ├── final-version.js                       # GEE application source code (v55)
│       ├── ui-framework-v2.js – v54.js            # Previous iterations of the GEE app (lost some iterations)

```

### GEE App Version History

The `v*.js` and `ui-framework-v*.js` files document the iterative development of the Earth Engine application. Key milestones include the addition of the split-panel map, tract profiling, comparative analysis, and performance optimisations (e.g. pre-simplified tract geometries, permanent boundary overlays). The final production version is `final-version.js` (v55).

## How to Use the Application

1. **Open the GEE app** from the embedded iframe on the [project page](https://yxing82.github.io/CASA0025_Final_Project/) or directly via the [Earth Engine Apps link](https://project-ba3da252-127d-4b0d-bf0.projects.earthengine.app/view/turf-tracker).
2. **Select a layer** using the pill buttons: Greenness, Heat, Water, or Satellite.
3. **Set the time range** — choose a single month or compare two months side by side.
4. **Toggle data mode** — switch between "Actual data" and "Seasonally adjusted data" to see raw values vs. change from the 2019 baseline.
5. **Click a tract** on the map to view its environmental profile (stats, histograms, trends).
6. **Use Compare Tracts** to select two tracts and overlay their monthly metrics.
7. **Use Quick Navigation** to jump to specific cities or neighbourhoods.

## Important Caveats

- **Not a causal model.** The dashboard identifies spatial co-occurrence of turf loss and temperature increase, but cannot confirm direct causation — surface materials, urban form, and broader climate variability also influence LST.
- **FVC does not distinguish turf from trees.** Measured vegetation loss may include natural vegetation changes unrelated to AB 356.
- **Landsat thermal resolution (30 m)** may blend urban heat island signals with surrounding impervious surfaces.
- **OpenET uncertainty increases** in arid regions with sparse vegetation, potentially overestimating water savings.
- **Monthly composites smooth out** short-term irrigation events; the dashboard captures trends rather than instantaneous conditions.

## Contributors

| Name | Role |
|------|------|
| **Yujing (Olivia) Xing** | GEE App Architecture, UI/UX Design & Development, Concept Direction |
| **Luke Benson** | SMA/FVC Methodology, Vegetation Analysis, Project Concept |
| **Yoav Gochman** | LST Analysis, Water Consumption / ET Estimation, Preprocessing |
| **Christy Choi** | Preprocessing, UI Contributions, Legend System |
| **Waiie Tsang** | Literature Review, Narrative Content |
| **Nanxi Lu** | Literature Review, Narrative Content |

<details>
<summary><b>Click to view Summary of Key Contributions and Use of AI for Tasks</b></summary>

| Task Name | Major Contributors | Additional Contributors | Use of AI in this task |
| :--- | :--- | :--- | :--- |
| Project Concept and Idea Development | Luke | All team members | |
| Problem Statement, End User Definition and Project Scoping | All team members | | No AI use |
| Literature Review – Colorado River Basin Crisis and Nevada AB 356 Policy Context | Nanxi, Waiie | | |
| Literature Review – Remote Sensing Methods (SMA, FVC, LST, Evapotranspiration) | Nanxi, Waiie | | |
| Preprocessing - Cloud masking code and temperature conversion preparation | Christy, Luke, Yoav | | Used for code generation. |
| Preprocessing - Study area defined and Shape file uploaded | Christy, Luke, Olivia | | Gemini was used to help understand study boundaries |
| Methodology – FVC Estimation via 5-Endmember Spectral Mixture Analysis (Sentinel-2) | Luke | | Used to help locate relevant research and clean up GEE code. |
| Methodology – Sentinel-2 Cloud Masking, Monthly Compositing and Gap-Filling | Luke | | Used for code generation. |
| Methodology – RMSE Validation | Luke | | Used to help locate relevant research. |
| Methodology – Vegetation Baseline Differencing (Seasonal Adjustment vs 2019) | Luke | | Used for coding structure. |
| Methodology – Land Surface Temperature Analysis (Landsat 8 Thermal Band 10) | Yoav | | Used for code generation. |
| Methodology – Land Surface Temperature Baseline Differencing (Seasonal Adjustment vs 2019) | Yoav | | Used for code generation. |
| Methodology – Water Consumption / Evapotranspiration Estimation (OpenET Ensemble) | Yoav | | Used for general research about water consumption as a proxy |
| Methodology – Water Baseline Differencing (Seasonal Adjustment vs 2019) | Yoav | | Used for code generation. |
| GEE App – Overall Architecture, State Management and Data Pipeline | Olivia | Christy | Claude was used to give a design structure |
| GEE App – Pre-processing: Study Area Boundary Compilation and Tract Geometry Simplification | Olivia | Christy | Gemini was used to understand the US census tracts |
| GEE App – Precomputed Raster Layer Pipeline (FVC, LST, ET and Difference Layers) | Yoav | | Used for code generation. |
| GEE App – Left Sidebar Layout, Tab System (Tract Profile / Compare / About) | Olivia | Christy, Yoav, Luke | Claude and Gemini were used to debug UI code |
| GEE App – Synchronised Split-Panel Maps with Draggable Divider | Olivia | | Claude and Gemini were used to debug UI code |
| GEE App – Layer Switching (Greenness / Heat / Water / Satellite Pill Buttons) | Olivia | | Claude and Gemini were used to debug UI code |
| GEE App – Time Controls (Single Month vs Compare Mode, Actual vs Seasonally Adjusted) | Olivia | Yoav, Luke | Claude and Gemini were used to debug UI code |
| GEE App – Quick Navigation Dropdown (Incorporated Cities and CDPs) | Olivia | | Claude was used to understand US government levels |
| GEE App – Interactive Tract Profiling (Click-to-Select, Stat Cards, Histograms, Trend Charts) | Olivia, Christy | | Claude was used to help structure the charts layout |
| GEE App – Compare Tracts View (Side-by-Side Stats, Overlaid FVC / LST / ET Charts) | Olivia | | Gemini was used to debug UI code |
| GEE App – Tract-Level Aggregation and Summary Statistics Computation | Olivia | | No AI use |
| GEE App – About Section, How-to-Use Guide and Narrative Content | Waiie, Nanxi, Olivia | | No AI use |
| GEE App – Boundary Vector Overlay and Styling (Optimised Permanent Layers) | Yoav, Olivia | | Gemini was used to debug UI code |
| GEE App – Legend System, Colour Ramps and Dynamic Legend Visibility | Christy, Olivia | Yoav | Gemini was used to refine the colour palette |
| GEE App – Overall UX Refinement, Responsiveness and Interactivity Polish | Olivia, Christy | | Gemini was used to debug UI code |
| Project Markdown File and GitHub Pages Documentation | Luke, Christy, Olivia | | Gemini was used to debug content scrolling code |

</details>


## Acknowledgements

This project was developed for **CASA0025: Building Spatial Applications with Big Data** at the Centre for Advanced Spatial Analysis (CASA), University College London.

AI tools (Claude, Gemini, ChatGPT) were used in specific tasks as documented in the labour division log, primarily for debugging UI code, refining code structure, and understanding domain-specific context. All methodological decisions and analytical interpretations are the team's own.

## License

This project is for academic purposes as part of the UCL CASA MSc programme.

