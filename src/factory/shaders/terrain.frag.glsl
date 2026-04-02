#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Camera: world-space center and zoom
uniform vec2  u_camera;
uniform float u_zoom;
// Viewport size in CSS pixels
uniform vec2  u_viewport;
// Grid cell size in world pixels
uniform float u_gridSize;


// Procedural top-down terrain shader for the factory game background.
//
// Biome selection uses two independent noise fields at continent scale:
//   - Temperature (0 = cold, 1 = hot)
//   - Humidity    (0 = dry,  1 = wet)
//
// The 2D (temp, humidity) plane is partitioned into four biomes with hard
// borders — the nearest biome wins, no blending between biomes:
//   Forest     — cool + wet:  dense dark-green canopy on dark soil
//   Grassland  — mild + moderate: green grass with brown dirt patches
//   Steppe     — warm + dry:  dry yellow grass on exposed soil
//   Desert     — hot  + dry:  sandy terrain with rocky outcrops
//
// Within a biome, temperature still smoothly affects color tint (e.g. warmer
// grassland has yellower grass, cooler grassland has deeper green). This gives
// sharp biome boundaries but smooth intra-biome color variation.
//
// Within each biome, multiple noise layers at different frequencies produce:
//   - Patch shapes (low freq) — where grass/dirt/rock regions form.
//   - Color variety (mid freq) — blending multiple color tones per material.
//   - Micro texture (high freq) — per-pixel brightness jitter for grain.
//
// A subtle grid overlay is drawn analytically using fract-based distance
// to the nearest grid line.
//
// All noise is value-noise-based FBM using an integer hash (no sin).


// ---------------------------------------------------------------
// Constants — noise frequencies, colors, blend thresholds
// ---------------------------------------------------------------

// World coordinate prescalers — divide world coords before multiplying by freq,
// so frequency constants stay in a precision-friendly range (0.1–10.0).
const float BIOME_SCALE  = 1.0 / 2000.0; // biome-level
const float DETAIL_SCALE = 1.0 / 100.0;  // detail-level
const float MICRO_SCALE  = 4.0;    // micro-level

// Biome parameter noise frequencies (applied after BIOME_SCALE)
const float TEMP_FREQ      = 0.6; // temperature field scale
const float HUMIDITY_FREQ  = 0.7; // humidity field scale

// Detail noise frequencies (applied after DETAIL_SCALE)
const float DIRT_FREQ        = 2.0;  // dirt color variation
const float DIRT_HUE_FREQ    = 0.8;  // color variation between dirt patches
const float GRASS_MASK_FREQ  = 0.3;  // grass/dirt patch size
const float GRASS_HUE_FREQ   = 1.0;  // color variation between grass patches
const float SAND_FREQ        = 2.0;  // sand color variation
const float ROCK_FREQ        = 0.2;  // rocky outcrop size
const float DUNE_FREQ        = 0.1;  // broad dune ridge pattern

// Micro noise frequencies (applied after MICRO_SCALE)
const float MICRO_FREQ_LAND  = 0.6;  // per-pixel texture on land
const float MICRO_FREQ_SAND  = 0.5;  // per-pixel texture on sand

// Patch masks — smoothstep ranges
const float DIRT_EDGE_LO = 0.38; // below = full grass
const float DIRT_EDGE_HI = 0.55; // above = bare dirt
const float ROCK_EDGE_LO = 0.55; // below = plain sand
const float ROCK_EDGE_HI = 0.85; // above = full rock

// Micro-variation amplitude (centered: ±half)
const float MICRO_AMP_LAND = 0.02; // brightness jitter on land
const float MICRO_AMP_SAND = 0.015; // brightness jitter on sand
const float DUNE_AMP       = 0.04; // dune ridge brightness boost

// Biome centers in (temperature, humidity) space
const vec2 BIOME_FOREST    = vec2(0.30, 0.75); // cool, wet
const vec2 BIOME_GRASSLAND = vec2(0.45, 0.50); // mild, moderate
const vec2 BIOME_STEPPE    = vec2(0.65, 0.25); // warm, dry
const vec2 BIOME_DESERT    = vec2(0.85, 0.10); // hot, dry

// --- Grassland palette ---
const vec3 DIRT_LIGHT      = vec3(0.36, 0.28, 0.18); // light brown
const vec3 DIRT_DARK       = vec3(0.42, 0.33, 0.22); // dark brown
const vec3 DIRT_RED        = vec3(0.44, 0.28, 0.16); // reddish clay
const vec3 DIRT_GREY       = vec3(0.34, 0.32, 0.28); // grey-brown soil
const vec3 GRASS_COOL      = vec3(0.18, 0.42, 0.12); // deep green (cool temperature)
const vec3 GRASS_MID       = vec3(0.25, 0.45, 0.16); // standard green
const vec3 GRASS_WARM      = vec3(0.40, 0.50, 0.20); // yellow-green (warm temperature)
const vec3 GRASS_OLIVE     = vec3(0.32, 0.40, 0.18); // olive/brownish green
const vec3 GRASS_HUE_SHIFT = vec3(-0.04, 0.05, -0.03); // per-patch color offset

// --- Forest palette ---
const vec3 FOREST_CANOPY1  = vec3(0.12, 0.30, 0.08); // dark evergreen
const vec3 FOREST_CANOPY2  = vec3(0.18, 0.36, 0.12); // lighter canopy
const vec3 FOREST_CANOPY3  = vec3(0.10, 0.28, 0.14); // blue-green tint
const vec3 FOREST_FLOOR    = vec3(0.24, 0.22, 0.14); // dark forest soil
const vec3 FOREST_MOSS     = vec3(0.20, 0.32, 0.12); // mossy patches

// --- Steppe palette ---
const vec3 STEPPE_GRASS    = vec3(0.48, 0.50, 0.25); // dry yellow grass
const vec3 STEPPE_BARE     = vec3(0.52, 0.44, 0.30); // exposed dry soil
const vec3 STEPPE_SCRUB    = vec3(0.40, 0.42, 0.22); // sparse shrubby patches

// --- Desert palette ---
const vec3 SAND_LIGHT = vec3(0.72, 0.62, 0.42); // light tan
const vec3 SAND_DARK  = vec3(0.78, 0.68, 0.48); // warm sand
const vec3 ROCK_COLOR = vec3(0.55, 0.48, 0.35); // darker rocky patches

// Grid overlay
const float GRID_MINOR_WIDTH   = 0.8;
const float GRID_MAJOR_WIDTH   = 1.2;
const float GRID_MINOR_OPACITY = 0.06;
const float GRID_MAJOR_OPACITY = 0.12;
const float GRID_MAJOR_EVERY   = 16.0;
const vec3  GRID_COLOR         = vec3(1.0);


// ---------------------------------------------------------------
// Noise helpers (value noise + FBM)
// ---------------------------------------------------------------

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic interpolation (Perlin's improved curve) — zero 1st and 2nd
  // derivatives at grid points, eliminating visible grid-edge artifacts
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float amp = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    v += amp * vnoise(p);
    p = p * 2.0 + shift;
    amp *= 0.5;
  }
  return v;
}

// Zoom-adaptive FBM for detail noise: adds octaves when zoomed in so fine
// detail resolves smoothly instead of showing blocky noise cells.
// At zoom=1 uses baseOctaves, each 2x zoom adds 1 octave (up to +4).
float zfbm(vec2 p, int baseOctaves, float zoom) {
  int extra = int(clamp(log2(max(zoom, 1.0)), 0.0, 4.0));
  return fbm(p, baseOctaves + extra);
}


// ---------------------------------------------------------------
// Biome blending — controls sharpness of transitions between biomes
const float BIOME_BLEND_SHARPNESS = 24.0; // higher = sharper borders

// ---------------------------------------------------------------
// Biome climate sampling and weighting
// ---------------------------------------------------------------

// Sample climate noise fields
vec2 climateAt(vec2 world) {
  vec2 bw = world * BIOME_SCALE;
  float temp = fbm(bw * TEMP_FREQ + vec2(0.0, 0.0), 4);
  float humid = fbm(bw * HUMIDITY_FREQ + vec2(10.0, 20.0), 4);
  return vec2(temp, humid);
}

// Compute biome blend weights from climate parameters.
// Uses softmax-like weighting: weight = exp(-sharpness * distance^2).
void biomeWeights(vec2 climate, out float wForest, out float wGrassland,
                  out float wSteppe, out float wDesert, out float temp) {
  float dF = dot(climate - BIOME_FOREST,    climate - BIOME_FOREST);
  float dG = dot(climate - BIOME_GRASSLAND, climate - BIOME_GRASSLAND);
  float dS = dot(climate - BIOME_STEPPE,    climate - BIOME_STEPPE);
  float dD = dot(climate - BIOME_DESERT,    climate - BIOME_DESERT);

  wForest    = exp(-BIOME_BLEND_SHARPNESS * dF);
  wGrassland = exp(-BIOME_BLEND_SHARPNESS * dG);
  wSteppe    = exp(-BIOME_BLEND_SHARPNESS * dS);
  wDesert    = exp(-BIOME_BLEND_SHARPNESS * dD);

  float total = wForest + wGrassland + wSteppe + wDesert;
  wForest /= total;
  wGrassland /= total;
  wSteppe /= total;
  wDesert /= total;

  temp = climate.x;
}


// ---------------------------------------------------------------
// Biome color functions
// ---------------------------------------------------------------

vec3 forestColor(vec2 dw, vec2 mw, float ms, float temp, float zoom) {
  // Dense canopy with floor showing through gaps
  float canopyVar = zfbm(dw * GRASS_HUE_FREQ * 0.8 + vec2(8.0, 1.0), 4, zoom);
  vec3 canopyA = mix(FOREST_CANOPY1, FOREST_CANOPY2, canopyVar);
  float canopyVar2 = zfbm(dw * GRASS_HUE_FREQ * 0.5 + vec2(2.5, 7.0), 4, zoom);
  vec3 canopyB = mix(FOREST_CANOPY3, FOREST_MOSS, canopyVar2);
  vec3 canopy = mix(canopyA, canopyB, smoothstep(0.3, 0.7, canopyVar2));

  // Warmer forest → slightly brighter/yellower canopy
  canopy += (temp - 0.3) * vec3(0.04, 0.02, -0.02);

  // Forest floor visible in gaps
  float gapMask = zfbm(dw * GRASS_MASK_FREQ * 2.0 + vec2(4.5), 4, zoom);
  gapMask = smoothstep(0.58, 0.68, gapMask);
  vec3 floor = mix(FOREST_FLOOR, FOREST_MOSS, zfbm(dw * DIRT_FREQ + vec2(5.5), 4, zoom));

  float micro = vnoise(mw * MICRO_FREQ_LAND) * MICRO_AMP_LAND * ms - MICRO_AMP_LAND * ms * 0.5;
  return mix(canopy + micro, floor + micro, gapMask);
}

vec3 grasslandColor(vec2 dw, vec2 mw, float ms, float temp, float zoom) {
  // Dirt color variety
  float dirtVar1 = zfbm(dw * DIRT_FREQ + vec2(0.5), 4, zoom);
  float dirtVar2 = zfbm(dw * DIRT_HUE_FREQ + vec2(1.5, 0.6), 4, zoom);
  vec3 dirtA = mix(DIRT_LIGHT, DIRT_DARK, dirtVar1);
  vec3 dirtB = mix(DIRT_RED, DIRT_GREY, dirtVar2);
  vec3 dirt = mix(dirtA, dirtB, smoothstep(0.35, 0.65, dirtVar2));

  // Dirt patches
  float dirtMask = zfbm(dw * GRASS_MASK_FREQ, 5, zoom);
  dirtMask = smoothstep(DIRT_EDGE_LO, DIRT_EDGE_HI, dirtMask);

  // Grass base color shifts with temperature: cool→deep green, warm→yellow-green
  float t = smoothstep(0.3, 0.6, temp);
  vec3 grassBase = mix(GRASS_COOL, GRASS_WARM, t);

  // Local hue variety on top of temperature tint
  float hue1 = zfbm(dw * GRASS_HUE_FREQ + vec2(2.0, 3.0), 4, zoom);
  float hue2 = zfbm(dw * GRASS_HUE_FREQ * 0.6 + vec2(5.0, 0.8), 4, zoom);
  vec3 grass = mix(grassBase, mix(GRASS_MID, GRASS_OLIVE, hue2), smoothstep(0.3, 0.7, hue1));
  grass += (hue1 - 0.5) * GRASS_HUE_SHIFT;

  float micro = vnoise(mw * MICRO_FREQ_LAND) * MICRO_AMP_LAND * ms - MICRO_AMP_LAND * ms * 0.5;
  return mix(grass + micro, dirt + micro, dirtMask);
}

vec3 steppeColor(vec2 dw, vec2 mw, float ms, float temp, float zoom) {
  float base = zfbm(dw * DIRT_FREQ + vec2(9.0), 4, zoom);
  vec3 soil = mix(STEPPE_BARE, STEPPE_SCRUB, base);

  // Sparse dry grass patches
  float grassMask = zfbm(dw * GRASS_MASK_FREQ * 1.5 + vec2(3.5), 4, zoom);
  grassMask = smoothstep(0.45, 0.60, grassMask);
  vec3 dryGrass = mix(STEPPE_GRASS, STEPPE_SCRUB, zfbm(dw * GRASS_HUE_FREQ + vec2(6.0), 4, zoom));

  // Hotter steppe → more yellow/brown
  dryGrass += (temp - 0.5) * vec3(0.05, 0.02, -0.03);

  float micro = vnoise(mw * MICRO_FREQ_LAND) * MICRO_AMP_LAND * ms - MICRO_AMP_LAND * ms * 0.5;
  return mix(soil + micro, dryGrass + micro, grassMask);
}

vec3 desertColor(vec2 dw, vec2 mw, float ms, float zoom) {
  float base = zfbm(dw * SAND_FREQ + vec2(7.0), 4, zoom);
  vec3 sand = mix(SAND_LIGHT, SAND_DARK, base);

  float rockMask = zfbm(dw * ROCK_FREQ + vec2(4.0, 1.0), 4, zoom);
  rockMask = smoothstep(ROCK_EDGE_LO, ROCK_EDGE_HI, rockMask);

  float dune = vnoise(dw * DUNE_FREQ + vec2(0.0, 5.0));
  sand += dune * DUNE_AMP;

  float micro = vnoise(mw * MICRO_FREQ_SAND) * MICRO_AMP_SAND * ms - MICRO_AMP_SAND * ms * 0.5;
  return mix(sand + micro, ROCK_COLOR + micro, rockMask);
}


// ---------------------------------------------------------------
// Grid overlay
// ---------------------------------------------------------------

float gridLine(vec2 world, float cellSize, float lineWidth) {
  vec2 grid = abs(fract(world / cellSize + 0.5) - 0.5);
  float dist = min(grid.x * cellSize, grid.y * cellSize);
  return 1.0 - smoothstep(0.0, lineWidth, dist);
}


// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

void main() {
  // Screen pixel → world coordinate (flip Y: GL has 0 at bottom, camera has 0 at top)
  vec2 screen = vec2(v_uv.x, 1.0 - v_uv.y) * u_viewport;
  vec2 world = (screen - u_viewport * 0.5) / u_zoom + u_camera;

  // Prescale world coordinates for each frequency tier
  vec2 dw = world * DETAIL_SCALE;
  vec2 mw = world * MICRO_SCALE;

  // Micro-noise fades out when zoomed out
  float ms = clamp(u_zoom, 0.0, 1.0);

  // Sample climate and compute biome weights
  vec2 climate = climateAt(world);
  float wF, wG, wS, wD, temp;
  biomeWeights(climate, wF, wG, wS, wD, temp);

  // Blend biome colors by weight
  vec3 terrain = wF * forestColor(dw, mw, ms, temp, u_zoom)
               + wG * grasslandColor(dw, mw, ms, temp, u_zoom)
               + wS * steppeColor(dw, mw, ms, temp, u_zoom)
               + wD * desertColor(dw, mw, ms, u_zoom);

  // Grid overlay
  float minor = gridLine(world, u_gridSize, GRID_MINOR_WIDTH);
  float major = gridLine(world, u_gridSize * GRID_MAJOR_EVERY, GRID_MAJOR_WIDTH);
  terrain = mix(terrain, GRID_COLOR, minor * GRID_MINOR_OPACITY);
  terrain = mix(terrain, GRID_COLOR, major * GRID_MAJOR_OPACITY);

  fragColor = vec4(terrain, 1.0);
}
