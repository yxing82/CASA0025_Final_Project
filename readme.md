This is a repository for the Las Vegas Valley Turf Tracker.

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
